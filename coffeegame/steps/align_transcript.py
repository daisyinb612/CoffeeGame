#!/usr/bin/env python3
"""按原视频时间将逐句转写对应到音画动作段；只建立时间关系。"""

import argparse
import json
import math
import os
import tempfile
from pathlib import Path

from coffeegame.steps.analyze_audio import validate_audio_events
from coffeegame.steps.analyze_video import validate_timeline
from coffeegame.core.logging_utils import log_event
from coffeegame.core.video_metadata import duration_seconds


def align(video_analysis, audio_analysis, source_video, output):
    """只保存音频事件与动作段的索引关系，不重复原话或动作正文。"""
    if not source_video.is_file():
        raise ValueError(f"视频不存在：{source_video}")
    duration = duration_seconds(source_video)
    video = validate_timeline(video_analysis.read_text(encoding="utf-8"), duration)
    audio = json.loads(audio_analysis.read_text(encoding="utf-8"))
    source = audio.get("source") if isinstance(audio, dict) else None
    events = audio.get("events") if isinstance(audio, dict) else None
    if not isinstance(source, dict) or not isinstance(events, list):
        raise ValueError("音频分析缺少 source 或 events")
    source_file = source.get("source_file")
    if not isinstance(source_file, str) or Path(source_file).resolve() != source_video.resolve():
        raise ValueError("音频来源与指定视频不同；不能按时间对齐")
    offset = source.get("offset_seconds")
    audio_duration = source.get("duration_seconds")
    if (not isinstance(offset, (int, float)) or isinstance(offset, bool)
            or not isinstance(audio_duration, (int, float)) or isinstance(audio_duration, bool)
            or not math.isfinite(offset) or not math.isfinite(audio_duration)
            or offset < 0 or audio_duration <= 0 or offset + audio_duration > duration + 0.5):
        raise ValueError("音频来源的时间范围无效")
    relative = {"events": [
        {**event, "start_seconds": event["start_seconds"] - offset,
         "end_seconds": event["end_seconds"] - offset}
        for event in events
    ]}
    validate_audio_events(relative, audio_duration)

    links = []
    unmatched = []
    ignored_non_speech = []
    speech_count = 0
    for event_index, event in enumerate(events, start=1):
        if event["kind"] != "speech":
            ignored_non_speech.append(event_index)
            continue
        speech_count += 1
        matched = False
        for segment_index, segment in enumerate(video["segments"], start=1):
            overlap = min(event["end_seconds"], segment["end_seconds"]) - max(
                event["start_seconds"], segment["start_seconds"])
            if overlap > 0:
                links.append({"transcript_event_index": event_index,
                              "video_segment_index": segment_index,
                              "overlap_seconds": round(overlap, 3)})
                matched = True
        if not matched:
            unmatched.append(event_index)
    result = {
        "source_video": str(source_video.resolve()),
        "video_analysis": str(video_analysis.resolve()),
        "transcript": str(audio_analysis.resolve()),
        "alignment_method": "time_overlap_only",
        "video_segment_count": len(video["segments"]),
        "speech_event_count": speech_count,
        "links": links,
        "unmatched_transcript_event_indices": unmatched,
        "ignored_non_speech_event_indices": ignored_non_speech,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json",
                                     dir=output.parent, delete=False) as tmp:
        temporary_output = Path(tmp.name)
        json.dump(result, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
    os.replace(temporary_output, output)
    log_event(f"逐句对齐已保存：{output.resolve()}；{speech_count} 句、"
              f"{len(video['segments'])} 个动作段、{len(links)} 条时间关联、"
              f"{len(unmatched)} 句未关联")
    return result


def main():
    """读取同一视频的两份 JSON，并生成可复核的时间重叠索引。"""
    parser = argparse.ArgumentParser(description="按时间对齐音画动作段和逐句转写")
    parser.add_argument("--video-analysis", type=Path, required=True)
    parser.add_argument("--audio-analysis", type=Path, required=True)
    parser.add_argument("--source-video", type=Path, required=True,
                        help="音频抽取所用的同一份视频")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        align(args.video_analysis, args.audio_analysis, args.source_video, args.output)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        log_event(f"逐句对齐失败：{exc}", "ERROR")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
