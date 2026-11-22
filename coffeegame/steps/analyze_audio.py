#!/usr/bin/env python3
"""把 WAV 音轨送给 Gemini，保存独立的声音事件时间线。"""

import argparse
import base64
import json
import math
import os
import re
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
DEFAULT_PROMPT_PATH = ROOT / "coffeegame" / "prompts" / "audio_events_v1.txt"
MAX_AUDIO_BYTES = 60 * 1024 * 1024
AUDIO_EVENTS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "events": {
            "type": "array",
            "description": "按开始时间排序的实际可听声音事件",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "start_time": {"type": "string", "description": "相对输入音频的 MM:SS 起点"},
                    "end_time": {"type": "string", "description": "相对输入音频的 MM:SS 终点"},
                    "kind": {"type": "string", "enum": ["speech", "sound", "music"]},
                    "description": {"type": "string", "description": "中文声音特征，不猜画面或来源"},
                    "transcript": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "speaker": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "uncertain": {"type": "boolean"},
                },
                "required": ["start_time", "end_time", "kind", "description",
                             "transcript", "speaker", "uncertain"],
            },
        },
    },
    "required": ["events"],
}


def validate_audio_events(data, duration):
    """检查声音事件结构与相对音频的时间范围。"""
    if not isinstance(data, dict) or set(data) != {"events"} or not isinstance(data["events"], list):
        raise ValueError("顶层必须只包含 events 数组")
    previous_start = -1
    expected = {"start_seconds", "end_seconds", "kind", "description",
                "transcript", "speaker", "uncertain"}
    for index, event in enumerate(data["events"], start=1):
        if not isinstance(event, dict) or set(event) != expected:
            raise ValueError(f"第 {index} 个声音事件字段无效")
        start, end = event["start_seconds"], event["end_seconds"]
        if (not isinstance(start, (int, float)) or isinstance(start, bool)
                or not isinstance(end, (int, float)) or isinstance(end, bool)
                or not math.isfinite(start) or not math.isfinite(end)
                or not 0 <= start < end <= duration + 0.25 or start < previous_start):
            raise ValueError(f"第 {index} 个声音事件时间无效：{start}–{end}")
        previous_start = start
        if event["kind"] not in {"speech", "sound", "music"}:
            raise ValueError(f"第 {index} 个声音事件 kind 无效")
        if not isinstance(event["description"], str) or not event["description"].strip():
            raise ValueError(f"第 {index} 个声音事件缺少描述")
        if event["kind"] == "speech" and (not isinstance(event["transcript"], str)
                                             or not event["transcript"].strip()):
            raise ValueError(f"第 {index} 个语音事件缺少转写")
        if event["kind"] != "speech" and event["transcript"] is not None:
            raise ValueError(f"第 {index} 个非语音事件不应有转写")
        if event["speaker"] is not None and not isinstance(event["speaker"], str):
            raise ValueError(f"第 {index} 个声音事件 speaker 无效")
        if not isinstance(event["uncertain"], bool):
            raise ValueError(f"第 {index} 个声音事件 uncertain 无效")


def source_metadata(audio, offset_override):
    """读取抽取步骤的源视频偏移；外部 WAV 可用 --offset-seconds 指定。"""
    sidecar = audio.with_suffix(".source.json")
    metadata = json.loads(sidecar.read_text(encoding="utf-8")) if sidecar.is_file() else {}
    offset = offset_override if offset_override is not None else metadata.get("start_seconds", 0)
    if not isinstance(offset, (int, float)) or isinstance(offset, bool) or not math.isfinite(offset) or offset < 0:
        raise ValueError("源文件时间偏移必须是非负有限数")
    return {"audio_file": str(audio.resolve()),
            "source_file": metadata.get("source_file", str(audio.resolve())),
            "offset_seconds": offset}


def normalize_audio_kinds(data):
    """只修复枚举值中模型误插入的控制字符；不改动转写正文。"""
    warnings = []
    if not isinstance(data, dict) or not isinstance(data.get("events"), list):
        return warnings
    for index, event in enumerate(data["events"], start=1):
        if not isinstance(event, dict) or not isinstance(event.get("kind"), str):
            continue
        original = event["kind"]
        cleaned = re.sub(r"[\x00-\x20]", "", original)
        if cleaned != original and cleaned in {"speech", "sound", "music"}:
            event["kind"] = cleaned
            warnings.append(f"events 第 {index} 项 kind 含控制字符，已从 {original!r} 恢复为 {cleaned!r}")
    return warnings


def analyze(audio, output, prompt, key, url, model, timeout, offset_override,
            save_api_response=False, expected_model_version=None, schema_mode="json"):
    """只发送音轨，不发送画面；结果时间换算回源视频的秒数。"""
    if not audio.is_file() or audio.suffix.lower() != ".wav":
        raise ValueError("请输入存在的 WAV；视频可先运行 coffeegame.steps.extract_audio")
    if audio.stat().st_size > MAX_AUDIO_BYTES:
        raise ValueError("音轨超过 60 MiB；请缩短截取范围")
    if audio.resolve() == output.resolve():
        raise ValueError("输出路径不能与输入音轨相同")
    duration = duration_seconds(audio)
    source = source_metadata(audio, offset_override)
    log_event(f"分析音轨：{audio.resolve()}；时长 {duration:.2f} 秒，"
              f"源文件偏移 {source['offset_seconds']:g} 秒；请求模型 {model}")
    generation_config = {"responseMimeType": "application/json"}
    if schema_mode == "json":
        generation_config["responseJsonSchema"] = AUDIO_EVENTS_SCHEMA
    elif schema_mode != "none":
        raise ValueError(f"未知 schema_mode：{schema_mode}")
    payload = {
        "contents": [{"role": "user", "parts": [
            {"inlineData": {"mimeType": "audio/wav",
                            "data": base64.b64encode(audio.read_bytes()).decode("ascii")}},
            {"text": f"输入音频长 {duration:.2f} 秒，结束于 {media_timestamp(duration)}。"
                     "所有时间相对输入音频开头。\n" + prompt},
        ]}],
        "generationConfig": generation_config,
    }
    model_path = urllib.parse.quote(model, safe="-")
    response = request_json(f"{url}/v1beta/models/{model_path}:generateContent", key,
                            payload, timeout=timeout)
    save_audio_response(response, audio, output, duration, source, model,
                        save_api_response, expected_model_version)


def save_audio_response(response, audio, output, duration, source, model,
                        save_api_response=False, expected_model_version=None):
    """处理已收到的接口响应；可用于离线重处理，避免重新上传音轨。"""
    output.parent.mkdir(parents=True, exist_ok=True)
    if save_api_response:
        output.with_suffix(".api.json").write_text(
            json.dumps(response, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    actual_model = response.get("modelVersion")
    candidates = response.get("candidates", [])
    answer = "\n".join(part.get("text", "") for candidate in candidates
                       for part in candidate.get("content", {}).get("parts", []))
    raw_path = output.with_suffix(".raw.txt")
    raw_path.write_text(answer, encoding="utf-8")
    if expected_model_version and actual_model != expected_model_version:
        raise RuntimeError(f"响应模型版本不符：期望 {expected_model_version}，实际 {actual_model}；原文在 {raw_path}")
    if len(candidates) != 1 or candidates[0].get("finishReason") != "STOP" or not answer.strip():
        raise RuntimeError(f"模型没有正常完成输出；原文在 {raw_path}")
    try:
        data, repair_warning = parse_model_json(answer)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"模型输出不是有效 JSON：{exc}；原文在 {raw_path}") from exc
    warnings = [repair_warning] if repair_warning else []
    data, key_warnings = normalize_json_keys(data)
    warnings.extend(key_warnings)
    warnings.extend(normalize_timestamps(data, ("events",)))
    warnings.extend(normalize_audio_kinds(data))
    if actual_model != model:
        warnings.append(f"请求模型为 {model}，实际返回模型为 {actual_model or '未提供'}；结果需按实际模型复核。")
    try:
        validate_audio_events(data, duration)
    except ValueError as exc:
        warnings.append(f"声音事件结构或时间需复核：{exc}")
    if isinstance(data, dict) and isinstance(data.get("events"), list):
        for event in data["events"]:
            if isinstance(event, dict) and isinstance(event.get("start_seconds"), (int, float)) \
                    and isinstance(event.get("end_seconds"), (int, float)):
                event["start_seconds"] += source["offset_seconds"]
                event["end_seconds"] += source["offset_seconds"]
    events = data.get("events", []) if isinstance(data, dict) else []
    result = {"source": {**source, "duration_seconds": duration}, "events": events}
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json",
                                     dir=output.parent, delete=False) as tmp:
        temporary_output = Path(tmp.name)
        json.dump(result, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
    os.replace(temporary_output, output)
    warning_path = output.with_suffix(".warnings.txt")
    if warnings:
        warning_path.write_text("\n".join(warnings) + "\n", encoding="utf-8")
        log_event(f"音频结果需复核：{warning_path}", "WARN")
    else:
        warning_path.unlink(missing_ok=True)
    log_event(f"音频事件已保存：{output.resolve()}；{len(result['events'])} 项；"
              f"请求模型 {model}，实际模型 {actual_model}")


def main():
    """解析命令行参数并分析一个 WAV 音轨。"""
    parser = argparse.ArgumentParser(description="通过引力 VIP 分析 WAV 中的声音事件")
    parser.add_argument("--audio", type=Path, required=True, help="输入 WAV 音轨")
    parser.add_argument("--output", type=Path, help="输出 JSON；默认 test/<音轨名>_events.json")
    parser.add_argument("--model", help="覆盖默认模型 gemini-3.8-flash")
    parser.add_argument("--prompt-file", type=Path, help="自定义音频提示词文件")
    parser.add_argument("--offset-seconds", type=float, help="覆盖源视频中的时间偏移")
    parser.add_argument("--timeout", type=float, help="可选客户端超时；默认不设置")
    parser.add_argument("--schema-mode", choices=("json", "none"), default="json")
    parser.add_argument("--save-api-response", action="store_true")
    parser.add_argument("--expected-model-version")
    parser.add_argument("--response-file", type=Path,
                        help="离线重处理此前保存的 .api.json；不再次请求模型")
    args = parser.parse_args()
    try:
        if args.timeout is not None and args.timeout <= 0:
            raise ValueError("timeout 必须大于 0")
        prompt_path = args.prompt_file or DEFAULT_PROMPT_PATH
        prompt = prompt_path.read_text(encoding="utf-8")
        if not prompt.strip():
            raise ValueError("提示词不能为空")
        key, url, configured_model = load_config()
        model = args.model or configured_model
        output = args.output or ROOT / "test" / f"{args.audio.stem}_events.json"
        log_event(f"音频提示词：{prompt_path.resolve()}；结构化模式：{args.schema_mode}")
        if args.response_file:
            if not args.audio.is_file():
                raise ValueError(f"音轨不存在：{args.audio}")
            response = json.loads(args.response_file.read_text(encoding="utf-8"))
            duration = duration_seconds(args.audio)
            source = source_metadata(args.audio, args.offset_seconds)
            log_event(f"离线重处理响应：{args.response_file.resolve()}；不发送 HTTP 请求")
            save_audio_response(response, args.audio, output, duration, source, model,
                                args.save_api_response, args.expected_model_version)
        else:
            analyze(args.audio, output, prompt, key, url, model, args.timeout,
                    args.offset_seconds, args.save_api_response,
                    args.expected_model_version, args.schema_mode)
    except (ValueError, RuntimeError, OSError) as exc:
        log_event(f"音频分析失败：{exc}", "ERROR")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
