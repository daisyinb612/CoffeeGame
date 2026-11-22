#!/usr/bin/env python3
"""将带时间戳的视频帧与原声转写分段交给 GPT，生成动作时间线。"""

import argparse
import base64
import hashlib
import json
import math
import os
import tempfile
from pathlib import Path

from coffeegame import PROJECT_ROOT
from coffeegame.core.logging_utils import log_event
from coffeegame.core.openai_api import chat_completion, load_gpt_config
from coffeegame.core.structured_output import (
    media_timestamp, normalize_json_keys, normalize_timestamps, parse_model_json,
)
from coffeegame.steps.analyze_video import TIMELINE_JSON_SCHEMA, validate_timeline


DEFAULT_PROMPT = PROJECT_ROOT / "coffeegame" / "prompts" / "video_timeline_v3.txt"


def chunk_ranges(duration, chunk_seconds):
    """生成不重叠的片段；将不足五秒的尾段并入前一段。"""
    ranges = []
    start = 0.0
    while start < duration - 0.01:
        end = min(start + chunk_seconds, duration)
        if duration - end < 5:
            end = duration
        ranges.append((start, end))
        start = end
    return ranges


def load_inputs(manifest_path, transcript_path):
    """检查帧索引和转写确实来自同一份压缩视频。"""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    video = Path(manifest["source_video"]).resolve()
    source = transcript["source"]
    if Path(source["source_file"]).resolve() != video:
        raise ValueError("视频帧和转写音轨来源不同")
    if not isinstance(manifest.get("frames"), list) or not manifest["frames"]:
        raise ValueError("帧索引为空")
    if not isinstance(transcript.get("events"), list):
        raise ValueError("转写缺少 events")
    duration = manifest["duration_seconds"]
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError("视频时长无效")
    return manifest, transcript


def content_for_chunk(frames, utterances, prompt, start, end, manifest_dir):
    """把本片段的原声文字和逐帧图片装成 GPT 多模态消息。"""
    lines = [f"{media_timestamp(e['start_seconds'])}–{media_timestamp(e['end_seconds'])} "
             f"{e['transcript']}" for e in utterances]
    text = (
        f"这是原视频 {media_timestamp(start)} 到 {media_timestamp(end)} 的抽样画面。"
        "图片带绝对时间戳，下面是同一时段从原声独立转写的句子。"
        "你并未收到原始音频；只能根据转写引用说话内容，不得声称听到声音。"
        "动作起止时间尽量靠近可见证据；若采样不足以判定瞬间动作，标记 uncertain。"
        "输出时间使用相对整段视频开头的 MM:SS，不得超出本片段。"
        "本片段最后一个动作的 transition_to_next 为 null；跨片段过渡随后复核。\n"
        f"原声转写：\n{chr(10).join(lines) if lines else '这一段没有可辨认的语音。'}\n\n"
        + prompt
    )
    content = [{"type": "text", "text": text}]
    for frame in frames:
        path = manifest_dir / frame["file"]
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        content.append({"type": "text", "text": f"画面帧 {media_timestamp(frame['time_seconds'])}"})
        content.append({"type": "image_url", "image_url": {
            "url": f"data:image/jpeg;base64,{encoded}", "detail": "high"}})
    return content


def parse_chunk(response, raw_path, chunk_start, chunk_end, duration, frame_interval=1.0):
    """保存原文、修复模型格式噪声并验证时间范围。"""
    choices = response.get("choices", [])
    if len(choices) != 1:
        raise RuntimeError(f"GPT 返回 {len(choices)} 个候选，不是预期的 1 个")
    choice = choices[0]
    answer = choice.get("message", {}).get("content") or ""
    raw_path.write_text(answer, encoding="utf-8")
    if choice.get("finish_reason") != "stop" or not answer.strip():
        raise RuntimeError(f"GPT 输出未正常结束：{choice.get('finish_reason')}；原文 {raw_path}")
    data, repair_warning = parse_model_json(answer)
    warnings = [repair_warning] if repair_warning else []
    data, key_warnings = normalize_json_keys(data)
    warnings.extend(key_warnings)
    warnings.extend(normalize_timestamps(data, ("segments", "transition_windows")))
    timed_items = [item for name in ("segments", "transition_windows")
                   for item in data.get(name, [])]
    chunk_duration = chunk_end - chunk_start
    # 有时模型把每段开头当作 00:00；仅当所有时间都落在段内、且至少一个
    # 时间明显不可能是全片绝对时间时，才统一换算。混用两种基准仍交给校验报错。
    if (chunk_start > 0 and timed_items
            and all(isinstance(item.get("start_seconds"), (int, float))
                    and isinstance(item.get("end_seconds"), (int, float))
                    and 0 <= item["start_seconds"] < item["end_seconds"] <= chunk_duration + 0.5
                    for item in timed_items)
            and any(item["start_seconds"] < chunk_start - 0.5 for item in timed_items)):
        for item in timed_items:
            item["start_seconds"] = round(item["start_seconds"] + chunk_start, 3)
            item["end_seconds"] = round(item["end_seconds"] + chunk_start, 3)
        warnings.append(f"模型使用片段内相对时间；已加上 {chunk_start:g} 秒偏移，需复核。")
    for index, item in enumerate(data.get("segments", []), start=1):
        start = item.get("start_seconds")
        end = item.get("end_seconds")
        if (isinstance(start, (int, float)) and not isinstance(start, bool)
                and isinstance(end, (int, float)) and not isinstance(end, bool)
                and start == end and chunk_start <= start < chunk_end):
            item["end_seconds"] = round(min(start + frame_interval, chunk_end), 3)
            item["uncertain"] = True
            warnings.append(f"第 {index} 个动作起止均为 {start:g} 秒；按采样间隔暂定结束时间为 "
                            f"{item['end_seconds']:g} 秒，需核对原片。")
    validate_timeline(json.dumps(data, ensure_ascii=False), duration)
    for segment in data["segments"]:
        if segment["start_seconds"] < chunk_start - 0.5 or segment["end_seconds"] > chunk_end + 0.5:
            raise ValueError(f"GPT 动作超出片段 {chunk_start:g}–{chunk_end:g} 秒")
    return data, warnings


def analyze(manifest_path, transcript_path, output, model, url, key, prompt,
            chunk_seconds=30, timeout=None, save_api_response=False, resume=False):
    """逐段分析后合并为与 Gemini 步骤相同结构的 JSON。"""
    manifest, transcript = load_inputs(manifest_path, transcript_path)
    duration = manifest["duration_seconds"]
    manifest_dir = manifest_path.parent
    chunks_dir = output.parent / "gpt_chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)
    combined = {"segments": [], "transition_windows": []}
    warnings = []
    actual_models = []
    ranges = chunk_ranges(duration, chunk_seconds)
    for index, (start, end) in enumerate(ranges, start=1):
        frames = [frame for frame in manifest["frames"]
                  if start <= frame["time_seconds"] < end]
        utterances = [event for event in transcript["events"]
                      if event.get("kind") == "speech" and
                      event["start_seconds"] < end and event["end_seconds"] > start]
        if not frames:
            raise ValueError(f"第 {index} 段 {start:g}–{end:g} 秒没有视频帧")
        log_event(f"GPT 分析片段 {index}/{len(ranges)}：{start:g}–{end:g} 秒；"
                  f"{len(frames)} 帧、{len(utterances)} 句原声；模型 {model}")
        content = content_for_chunk(frames, utterances, prompt, start, end, manifest_dir)
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": content}],
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "video_timeline", "strict": True, "schema": TIMELINE_JSON_SCHEMA}},
            "max_completion_tokens": 12000,
        }
        stem = chunks_dir / f"chunk_{index:03d}"
        request_hash = hashlib.sha256(json.dumps(payload, ensure_ascii=False,
                                                 sort_keys=True).encode("utf-8")).hexdigest()
        chunk_path = stem.with_suffix(".json")
        meta_path = stem.with_suffix(".meta.json")
        api_path = stem.with_suffix(".api.json")
        api_meta_path = stem.with_suffix(".api.meta.json")
        cached = json.loads(meta_path.read_text(encoding="utf-8")) if resume and meta_path.is_file() else {}
        if resume and chunk_path.is_file() and cached.get("request_sha256") == request_hash:
            data = json.loads(chunk_path.read_text(encoding="utf-8"))
            validate_timeline(json.dumps(data, ensure_ascii=False), duration)
            chunk_warnings = cached.get("warnings", [])
            actual_model = cached.get("actual_model")
            log_event(f"复用已完成的 GPT 片段 {index}/{len(ranges)}")
        else:
            if resume and chunk_path.is_file() and cached.get("request_sha256") != request_hash:
                log_event(f"GPT 片段 {index}/{len(ranges)} 的帧、转写或提示词已变化；"
                          "旧缓存不适用，重新请求", "WARN")
            api_cached = (json.loads(api_meta_path.read_text(encoding="utf-8"))
                          if resume and api_meta_path.is_file() else {})
            if resume and api_path.is_file() and api_cached.get("request_sha256") == request_hash:
                response = json.loads(api_path.read_text(encoding="utf-8"))
                log_event(f"复用已收到的 GPT 原始响应 {index}/{len(ranges)}")
            else:
                response = chat_completion(url, key, payload, timeout=timeout)
                if save_api_response:
                    api_path.write_text(json.dumps(response, ensure_ascii=False, indent=2) + "\n",
                                        encoding="utf-8")
                    api_meta_path.write_text(json.dumps({"request_sha256": request_hash}, indent=2) + "\n",
                                             encoding="utf-8")
            data, chunk_warnings = parse_chunk(response, stem.with_suffix(".raw.txt"),
                                               start, end, duration, 1 / manifest["fps"])
            actual_model = response.get("model")
            chunk_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            meta_path.write_text(json.dumps({"request_sha256": request_hash,
                                             "actual_model": actual_model,
                                             "warnings": chunk_warnings}, ensure_ascii=False,
                                            indent=2) + "\n", encoding="utf-8")
        warnings.extend(f"片段 {index}: {item}" for item in chunk_warnings)
        actual_models.append(actual_model)
        if combined["segments"]:
            combined["segments"][-1]["transition_to_next"] = {
                "description": "跨分析片段边界，需核对实际过渡。", "uncertain": True}
        combined["segments"].extend(data["segments"])
        combined["transition_windows"].extend(data["transition_windows"])

    combined["segments"].sort(key=lambda item: item["start_seconds"])
    combined["transition_windows"].sort(key=lambda item: item["start_seconds"])
    validate_timeline(json.dumps(combined, ensure_ascii=False), duration)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json",
                                     dir=output.parent, delete=False) as tmp:
        json.dump(combined, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        temporary = Path(tmp.name)
    os.replace(temporary, output)
    metadata = {"requested_model": model, "actual_models": sorted(set(actual_models)),
                "chunk_seconds": chunk_seconds, "frame_fps": manifest["fps"],
                "frame_count": len(manifest["frames"]), "chunk_count": len(ranges)}
    output.with_suffix(".meta.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for actual in set(actual_models):
        if not isinstance(actual, str) or not actual.startswith(model):
            warnings.append(f"请求 GPT 模型 {model}，实际返回 {actual or '未知'}；需复核。")
    warning_path = output.with_suffix(".warnings.txt")
    if warnings:
        warning_path.write_text("\n".join(warnings) + "\n", encoding="utf-8")
        log_event(f"GPT 分析需复核：{warning_path}", "WARN")
    else:
        warning_path.unlink(missing_ok=True)
    log_event(f"GPT 动作分析已保存：{output.resolve()}；{len(combined['segments'])} 段；"
              f"实际模型 {', '.join(map(str, sorted(set(actual_models))))}")


def main():
    """解析 GPT 分帧分析的命令行参数。"""
    parser = argparse.ArgumentParser(description="用 GPT 分析带时间戳的视频帧和原声转写")
    parser.add_argument("--frames-manifest", type=Path, required=True)
    parser.add_argument("--transcript", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", help="默认 gpt-6.2-sol")
    parser.add_argument("--prompt-file", type=Path, default=DEFAULT_PROMPT)
    parser.add_argument("--chunk-seconds", type=int, default=30)
    parser.add_argument("--timeout", type=float, help="默认不设置客户端超时")
    parser.add_argument("--save-api-response", action="store_true")
    parser.add_argument("--resume", action="store_true", help="复用请求内容一致的已完成片段")
    args = parser.parse_args()
    try:
        if args.chunk_seconds < 10 or args.chunk_seconds > 120:
            raise ValueError("chunk-seconds 必须在 10 到 120 秒之间")
        if args.timeout is not None and args.timeout <= 0:
            raise ValueError("timeout 必须大于 0")
        key, url, configured_model = load_gpt_config()
        prompt = args.prompt_file.read_text(encoding="utf-8")
        analyze(args.frames_manifest, args.transcript, args.output,
                args.model or configured_model, url, key, prompt,
                args.chunk_seconds, args.timeout, args.save_api_response, args.resume)
    except (OSError, ValueError, RuntimeError, KeyError, TypeError, json.JSONDecodeError) as exc:
        log_event(f"GPT 视频分析失败：{exc}", "ERROR")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
