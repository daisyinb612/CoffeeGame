#!/usr/bin/env python3
"""将带原声的 MP4 和提示词发给 Gemini，保存音画联合理解 JSON。"""

import argparse
import base64
import json
import math
import os
import tempfile
import time
import urllib.parse
from pathlib import Path

from coffeegame import PROJECT_ROOT
from coffeegame.core.gemini_api import load_config, request_json
from coffeegame.core.logging_utils import log_event
from coffeegame.core.structured_output import (
    media_timestamp, normalize_json_keys, normalize_timestamps, parse_model_json,
)
from coffeegame.core.video_metadata import duration_seconds


ROOT = PROJECT_ROOT
# 内嵌视频会经 Base64 扩大约三分之一；限制文件体积以避免意外发送原片。
MAX_VIDEO_BYTES = 60 * 1024 * 1024
DEFAULT_PROMPT_PATH = ROOT / "coffeegame" / "prompts" / "video_timeline_v3.txt"
PROMPT = DEFAULT_PROMPT_PATH.read_text(encoding="utf-8")
TIMELINE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "segments": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "start_time": {"type": "STRING", "description": "相对视频开头的 MM:SS 动作开始时间"},
                    "end_time": {"type": "STRING", "description": "相对视频开头的 MM:SS 动作结束时间"},
                    "scene": {"type": "STRING", "description": "当前可见区域、视角和相关物品位置"},
                    "action": {"type": "STRING", "description": "本段实际可见的动作顺序和结果，中文"},
                    "objects": {
                        "type": "ARRAY",
                        "description": "本段真正被触碰、手持、移动或使用的物品",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "name": {"type": "STRING", "description": "可见物品名称"},
                                "description": {"type": "STRING", "description": "物品可见外观或位置"},
                                "interaction": {"type": "STRING", "description": "画面中实际发生的交互"},
                            },
                            "required": ["name", "description", "interaction"],
                        },
                    },
                    "evidence": {"type": "STRING", "description": "直接支持动作判断的画面线索"},
                    "audio_context": {
                        "description": "与本段有关的原声讲解或声音线索；没有则为 null",
                        "anyOf": [{"type": "STRING"}, {"type": "NULL"}],
                    },
                    "uncertain": {"type": "BOOLEAN", "description": "动作或关键物品是否有辨认疑问"},
                    "transition_to_next": {
                        "description": "到紧接着的下一段的可见过渡；最后一段为 null",
                        "anyOf": [
                            {"type": "NULL"},
                            {
                                "type": "OBJECT",
                                "properties": {
                                    "description": {"type": "STRING", "description": "本段结束状态如何进入下一段"},
                                    "uncertain": {"type": "BOOLEAN", "description": "过渡是否看不清或未拍到"},
                                },
                                "required": ["description", "uncertain"],
                            },
                        ],
                    },
                },
                "required": ["start_time", "end_time", "scene", "action", "objects",
                             "evidence", "audio_context", "uncertain", "transition_to_next"],
            },
        },
        "transition_windows": {
            "type": "ARRAY",
            "description": "只包含可见的真实停顿；没有则为空数组",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "start_time": {"type": "STRING"},
                    "end_time": {"type": "STRING"},
                    "evidence": {"type": "STRING"},
                    "uncertain": {"type": "BOOLEAN"},
                },
                "required": ["start_time", "end_time", "evidence", "uncertain"],
            },
        },
    },
    "required": ["segments", "transition_windows"],
}


def json_schema_types(value):
    """将 Gemini 旧 Schema 的类型名转换成标准 JSON Schema 类型名。"""
    if isinstance(value, dict):
        converted = {key: (item.lower() if key == "type" and isinstance(item, str)
                           else json_schema_types(item)) for key, item in value.items()}
        if converted.get("type") == "object":
            converted["additionalProperties"] = False
        return converted
    if isinstance(value, list):
        return [json_schema_types(item) for item in value]
    return value


TIMELINE_JSON_SCHEMA = json_schema_types(TIMELINE_SCHEMA)


def validate_timeline(answer, video_duration):
    """只接受字段完整、时间合理且按时间排序的动作 JSON。"""
    data = json.loads(answer)
    if not isinstance(data, dict) or not isinstance(data.get("segments"), list):
        raise ValueError("顶层必须是包含 segments 数组的 JSON 对象")
    if set(data) != {"segments", "transition_windows"} or not isinstance(data["transition_windows"], list):
        raise ValueError("顶层必须包含 segments 和 transition_windows 数组")
    segments = data["segments"]
    if not segments:
        raise ValueError("segments 为空")
    previous_start = -1
    for index, item in enumerate(segments, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"第 {index} 段不是对象")
        if set(item) != {"start_seconds", "end_seconds", "scene", "action", "objects",
                         "evidence", "audio_context", "uncertain", "transition_to_next"}:
            raise ValueError(f"第 {index} 段字段不符合约定")
        start, end = item.get("start_seconds"), item.get("end_seconds")
        if (not isinstance(start, (int, float)) or isinstance(start, bool)
                or not isinstance(end, (int, float)) or isinstance(end, bool)
                or not math.isfinite(start) or not math.isfinite(end)
                or not 0 <= start < end <= video_duration + 0.25):
            raise ValueError(f"第 {index} 段时间无效：{start}–{end}，视频长 {video_duration:.2f} 秒")
        if start < previous_start:
            raise ValueError(f"第 {index} 段的开始时间早于上一段")
        previous_start = start
        for field in ("scene", "action", "evidence"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"第 {index} 段缺少 {field}")
        if item["audio_context"] is not None and (not isinstance(item["audio_context"], str)
                                                   or not item["audio_context"].strip()):
            raise ValueError(f"第 {index} 段 audio_context 必须是非空字符串或 null")
        if not any("\u4e00" <= char <= "\u9fff" for char in item["action"]):
            raise ValueError(f"第 {index} 段 action 不是中文描述")
        objects = item.get("objects")
        if not isinstance(objects, list):
            raise ValueError(f"第 {index} 段 objects 必须是数组")
        for object_index, obj in enumerate(objects, start=1):
            if (not isinstance(obj, dict) or set(obj) != {"name", "description", "interaction"}
                    or any(not isinstance(obj.get(field), str) or not obj[field].strip()
                           for field in ("name", "description", "interaction"))):
                raise ValueError(f"第 {index} 段第 {object_index} 个物品字段无效")
        transition = item.get("transition_to_next")
        if index < len(segments) and transition is None:
            raise ValueError(f"第 {index} 段缺少到下一段的过渡描述")
        if index == len(segments) and transition is not None:
            raise ValueError("最后一段的 transition_to_next 必须为 null")
        if transition is not None and (not isinstance(transition, dict)
                                       or set(transition) != {"description", "uncertain"}
                                       or not isinstance(transition.get("description"), str)
                                       or not transition["description"].strip()
                                       or not isinstance(transition.get("uncertain"), bool)):
            raise ValueError(f"第 {index} 段 transition_to_next 字段无效")
        if not isinstance(item.get("uncertain"), bool):
            raise ValueError(f"第 {index} 段的 uncertain 必须是布尔值")
    previous_start = -1
    for index, item in enumerate(data["transition_windows"], start=1):
        if not isinstance(item, dict) or set(item) != {"start_seconds", "end_seconds", "evidence", "uncertain"}:
            raise ValueError(f"第 {index} 个转场区间字段不符合约定")
        start, end = item["start_seconds"], item["end_seconds"]
        if (not isinstance(start, (int, float)) or isinstance(start, bool)
                or not isinstance(end, (int, float)) or isinstance(end, bool)
                or not math.isfinite(start) or not math.isfinite(end)
                or not 0 <= start < end <= video_duration + 0.25
                or start < previous_start):
            raise ValueError(f"第 {index} 个转场区间时间无效：{start}–{end}")
        previous_start = start
        if not isinstance(item["evidence"], str) or not item["evidence"].strip():
            raise ValueError(f"第 {index} 个转场区间缺少依据")
        if not isinstance(item["uncertain"], bool):
            raise ValueError(f"第 {index} 个转场区间的 uncertain 必须是布尔值")
    return data


def analyze(url, key, model, video, prompt, output, timeout, save_api_response=False,
            expected_model_version=None, schema_mode="json", temperature=None, seed=None,
            allow_large_inline=False):
    """发送视频和提示词；优先保留模型原文，可解析时再写 JSON。"""
    if not video.is_file():
        raise ValueError(f"视频不存在：{video}")
    if output.resolve() == video.resolve():
        raise ValueError("输出路径不能与输入视频相同。")
    if video.stat().st_size > MAX_VIDEO_BYTES and not allow_large_inline:
        raise ValueError("视频超过 60 MiB；请先运行压缩步骤制作分析副本。")
    metadata_started = time.perf_counter()
    video_duration = duration_seconds(video)
    log_event(f"视频元数据：时长 {video_duration:.2f} 秒，文件 {video.stat().st_size / 1024**2:.1f} MiB；"
              f"读取耗时 {time.perf_counter() - metadata_started:.2f} 秒")

    generation_config = {"responseMimeType": "application/json"}
    if temperature is not None:
        generation_config["temperature"] = temperature
    if seed is not None:
        generation_config["seed"] = seed
    if schema_mode == "json":
        generation_config["responseJsonSchema"] = TIMELINE_JSON_SCHEMA
    elif schema_mode == "legacy":
        generation_config["responseSchema"] = TIMELINE_SCHEMA
    elif schema_mode != "none":
        raise ValueError(f"未知的 schema_mode：{schema_mode}")
    encode_started = time.perf_counter()
    encoded_video = base64.b64encode(video.read_bytes()).decode("ascii")
    log_event(f"视频 Base64 编码完成：{len(encoded_video) / 1024**2:.1f} MiB，"
              f"耗时 {time.perf_counter() - encode_started:.2f} 秒")
    payload = {
        "contents": [{"role": "user", "parts": [
            {"inlineData": {
                "mimeType": "video/mp4",
                "data": encoded_video,
            }},
            {"text": (
                f"输入视频长约 {video_duration:.2f} 秒，结束时间戳为 {media_timestamp(video_duration)}。"
                "所有时间相对于视频开头，不得晚于结束时间戳。"
                "请只返回有效的 JSON 对象，不要使用 Markdown 代码块。" + prompt
            )},
        ]}],
        "generationConfig": generation_config,
    }
    model_path = urllib.parse.quote(model, safe="-")
    result = request_json(f"{url}/v1beta/models/{model_path}:generateContent", key, payload, timeout=timeout)
    save_started = time.perf_counter()
    save_analysis_response(result, output, video_duration, model, expected_model_version,
                           save_api_response)
    log_event(f"分析结果处理完成，耗时 {time.perf_counter() - save_started:.2f} 秒")


def save_analysis_response(result, output, video_duration, model,
                           expected_model_version=None, save_api_response=False):
    """共用结果处理：保留模型原文，并将可解析的内容保存为 JSON。"""
    if save_api_response:
        api_path = output.with_suffix(".api.json")
        api_path.parent.mkdir(parents=True, exist_ok=True)
        api_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    actual_model_version = result.get("modelVersion")
    candidates = result.get("candidates", [])
    parts = [
        part.get("text", "")
        for candidate in candidates
        for part in candidate.get("content", {}).get("parts", [])
    ]
    answer = "\n".join(parts)
    raw_path = output.with_suffix(".raw.txt")
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path.write_text(answer, encoding="utf-8")
    if expected_model_version and actual_model_version != expected_model_version:
        raise RuntimeError(
            f"响应模型版本不符：请求期望 {expected_model_version}，实际 {actual_model_version}；原文已保存至 {raw_path}"
        )
    if len(candidates) != 1 or candidates[0].get("finishReason") != "STOP":
        reasons = [candidate.get("finishReason") for candidate in candidates]
        raise RuntimeError(f"接口没有正常完成生成：finishReason={reasons}；原文已保存至 {raw_path}")
    if not answer.strip():
        raise RuntimeError(f"接口没有返回文字；原始响应模型：{actual_model_version}")
    try:
        parsed, repair_warning = parse_model_json(answer)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"模型输出不是有效 JSON：{exc}；原文已保存至 {raw_path}") from exc
    warnings = [repair_warning] if repair_warning else []
    parsed, key_warnings = normalize_json_keys(parsed)
    warnings.extend(key_warnings)
    if actual_model_version != model:
        warnings.append(f"请求模型为 {model}，实际返回模型为 {actual_model_version or '未提供'}；结果需按实际模型复核。")
    warnings.extend(normalize_timestamps(parsed, ("segments", "transition_windows")))
    try:
        validate_timeline(json.dumps(parsed, ensure_ascii=False), video_duration)
    except ValueError as exc:
        warnings.append(f"输出结构或时间需后续整理：{exc}")
    warning_path = output.with_suffix(".warnings.txt")
    if warnings:
        warning_path.parent.mkdir(parents=True, exist_ok=True)
        warning_path.write_text("\n".join(warnings) + "\n", encoding="utf-8")
        log_event(f"结果需复核，问题记录在 {warning_path}", "WARN")
    else:
        warning_path.unlink(missing_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json", dir=output.parent, delete=False) as tmp:
        temporary_output = Path(tmp.name)
        json.dump(parsed, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
    os.replace(temporary_output, output)
    log_event(f"已保存模型输出：{output}（请求模型：{model}；返回模型：{actual_model_version}；原文：{raw_path}）")


def main():
    """解析视频、提示词和输出路径，调用 Gemini 视频理解接口。"""
    parser = argparse.ArgumentParser(description="联合分析 MP4 画面与原声，保存 JSON 回答")
    parser.add_argument("--video", type=Path, required=True, help="输入 MP4 视频路径")
    prompt_group = parser.add_mutually_exclusive_group()
    prompt_group.add_argument("--prompt", help="提示词；省略则使用默认提示词")
    prompt_group.add_argument("--prompt-file", type=Path, help="从 UTF-8 文件读取提示词")
    parser.add_argument("--output", type=Path, help="输出 JSON 路径；默认写入 test/<视频名>_analysis.json")
    parser.add_argument("--model", help="覆盖默认的 gemini-3.8-flash 模型")
    parser.add_argument("--timeout", type=float, help="可选客户端超时；默认不设置")
    parser.add_argument("--save-api-response", action="store_true", help="额外保存接口响应，供排查格式或截断问题")
    parser.add_argument("--expected-model-version", help="要求响应的 modelVersion 与此值完全一致")
    parser.add_argument("--schema-mode", choices=("json", "legacy", "none"), default="json",
                        help="结构化输出参数：新 JSON Schema、旧 Schema 或仅 JSON MIME")
    parser.add_argument("--temperature", type=float, help="可选生成温度；默认使用模型设置")
    parser.add_argument("--seed", type=int, help="可选生成随机种子")
    args = parser.parse_args()
    started = time.perf_counter()
    try:
        prompt = args.prompt_file.read_text(encoding="utf-8") if args.prompt_file else args.prompt
        if prompt is None:
            prompt = PROMPT
        if not prompt.strip():
            raise ValueError("提示词不能为空。")
        if args.timeout is not None and args.timeout <= 0:
            raise ValueError("timeout 必须大于 0")
        if args.temperature is not None and not 0 <= args.temperature <= 2:
            raise ValueError("temperature 必须在 0 到 2 之间")
        key, url, configured_model = load_config()
        model = args.model or configured_model
        output = args.output or ROOT / "test" / f"{args.video.stem}_analysis.json"
        prompt_source = args.prompt_file.resolve() if args.prompt_file else (
            "命令行 --prompt" if args.prompt is not None else DEFAULT_PROMPT_PATH)
        log_event(f"开始分析：{args.video.resolve()}；请求模型：{model}；"
                  f"提示词：{prompt_source}；结构化模式：{args.schema_mode}；输出：{output.resolve()}")
        analyze(url, key, model, args.video, prompt, output,
                args.timeout, args.save_api_response, args.expected_model_version,
                args.schema_mode, args.temperature, args.seed)
        log_event(f"分析步骤成功，总耗时 {time.perf_counter() - started:.2f} 秒")
    except (ValueError, RuntimeError, OSError) as exc:
        log_event(f"分析步骤失败，总耗时 {time.perf_counter() - started:.2f} 秒；原因：{exc}", "ERROR")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
