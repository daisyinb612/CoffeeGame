#!/usr/bin/env python3
"""将音画动作与逐句转写装入一份供人工复核的时间线。"""

import argparse
import json
import math
import os
import tempfile
from pathlib import Path

from coffeegame.core.logging_utils import log_event
from coffeegame.core.video_metadata import duration_seconds
from coffeegame.steps.analyze_audio import validate_audio_events
from coffeegame.steps.analyze_video import validate_timeline


def assemble(video_analysis, transcript, analysis_video, original_video, output):
    """每句原话只放一次，按最大时间交集归入一个动作段。"""
    duration = duration_seconds(analysis_video)
    video = validate_timeline(video_analysis.read_text(encoding="utf-8"), duration)
    audio = json.loads(transcript.read_text(encoding="utf-8"))
    if not isinstance(audio, dict) or not isinstance(audio.get("source"), dict) \
            or not isinstance(audio.get("events"), list):
        raise ValueError("转写 JSON 缺少 source 或 events")
    source = audio["source"]
    if not isinstance(source.get("source_file"), str) or \
            Path(source["source_file"]).resolve() != analysis_video.resolve():
        raise ValueError("转写音轨与音画分析使用的不是同一份视频")
    offset = source.get("offset_seconds")
    audio_duration = source.get("duration_seconds")
    if (not isinstance(offset, (int, float)) or isinstance(offset, bool)
            or not isinstance(audio_duration, (int, float)) or isinstance(audio_duration, bool)
            or not math.isfinite(offset) or not math.isfinite(audio_duration)
            or offset < 0 or audio_duration <= 0 or offset + audio_duration > duration + 0.5):
        raise ValueError("转写音轨的时间范围无效")
    relative_events = {"events": [
        {**event, "start_seconds": event["start_seconds"] - offset,
         "end_seconds": event["end_seconds"] - offset}
        for event in audio["events"]
    ]}
    validate_audio_events(relative_events, audio_duration)

    segments = [{"id": f"S{index}", **segment, "utterances": []}
                for index, segment in enumerate(video["segments"], start=1)]
    unassigned = []
    ignored_non_speech = []
    speech_count = 0
    for event_index, event in enumerate(audio["events"], start=1):
        if event["kind"] != "speech":
            ignored_non_speech.append(event_index)
            continue
        speech_count += 1
        overlaps = []
        for segment in segments:
            overlap = min(event["end_seconds"], segment["end_seconds"]) - max(
                event["start_seconds"], segment["start_seconds"])
            if overlap > 0:
                overlaps.append((segment, overlap))
        utterance = {
            "id": f"U{event_index}",
            "start_seconds": event["start_seconds"],
            "end_seconds": event["end_seconds"],
            "transcript": event["transcript"],
            "speaker": event["speaker"],
            "uncertain": event["uncertain"],
        }
        if not overlaps:
            unassigned.append(utterance)
            continue
        primary, overlap = max(overlaps, key=lambda pair: pair[1])
        utterance["time_overlap_seconds"] = round(overlap, 3)
        utterance["also_overlaps"] = [segment["id"] for segment, _ in overlaps
                                      if segment is not primary]
        primary["utterances"].append(utterance)

    warning_files = [str(path.resolve()) for path in (
        video_analysis.with_suffix(".warnings.txt"), transcript.with_suffix(".warnings.txt"))
        if path.is_file()]
    result = {
        "source_video": str(original_video.resolve()),
        "analysis_video": str(analysis_video.resolve()),
        "duration_seconds": duration,
        "utterance_link_method": "largest_time_overlap_only",
        "requires_review": bool(warning_files or unassigned),
        "warning_files": warning_files,
        "segments": segments,
        "transition_windows": video["transition_windows"],
        "unassigned_utterances": unassigned,
        "ignored_non_speech_event_indices": ignored_non_speech,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json",
                                     dir=output.parent, delete=False) as tmp:
        temporary_output = Path(tmp.name)
        json.dump(result, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
    os.replace(temporary_output, output)
    log_event(f"最终时间线已保存：{output.resolve()}；{len(segments)} 个动作段、"
              f"{speech_count} 句原话、{len(unassigned)} 句未分配")
    return result


def main():
    """合并已有结果；本步骤不请求模型。"""
    parser = argparse.ArgumentParser(description="将音画动作与逐句转写合成最终 JSON")
    parser.add_argument("--video-analysis", type=Path, required=True)
    parser.add_argument("--transcript", type=Path, required=True)
    parser.add_argument("--analysis-video", type=Path, required=True)
    parser.add_argument("--source-video", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        assemble(args.video_analysis, args.transcript, args.analysis_video,
                 args.source_video, args.output)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        log_event(f"最终时间线生成失败：{exc}", "ERROR")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
