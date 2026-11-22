#!/usr/bin/env python3
"""从媒体文件抽取指定时段音轨，生成供分析的 16 kHz 单声道 WAV。"""

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from coffeegame import PROJECT_ROOT
from coffeegame.core.logging_utils import log_event
from coffeegame.core.video_metadata import duration_seconds


def main():
    """只做音轨抽取；旁路记录源文件和时间偏移供后续对照。"""
    parser = argparse.ArgumentParser(description="从视频或音频中抽取 WAV 音轨")
    parser.add_argument("--input", type=Path, required=True, help="输入媒体文件")
    parser.add_argument("--output", type=Path, help="输出 WAV；默认 test/<输入名>_audio.wav")
    parser.add_argument("--start", type=float, default=0, help="源文件内起点秒数；默认 0")
    parser.add_argument("--duration", type=float, help="截取秒数；默认到源文件结束")
    args = parser.parse_args()
    output = args.output or PROJECT_ROOT / "test" / f"{args.input.stem}_audio.wav"
    if not args.input.is_file():
        parser.error(f"输入文件不存在：{args.input}")
    if args.input.resolve() == output.resolve():
        parser.error("输出路径不能与输入文件相同")
    if not shutil.which("ffmpeg"):
        parser.error("找不到 ffmpeg")
    source_duration = duration_seconds(args.input)
    if args.start < 0 or args.start >= source_duration:
        parser.error("start 必须位于源文件时长内")
    target_duration = args.duration if args.duration is not None else source_duration - args.start
    if target_duration <= 0 or args.start + target_duration > source_duration + 0.25:
        parser.error("duration 必须大于 0，且截取区间不能超过源文件时长")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", dir=output.parent, delete=False) as tmp:
        temporary_output = Path(tmp.name)
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(args.start),
               "-i", str(args.input), "-t", str(target_duration), "-map", "0:a:0", "-vn",
               "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", str(temporary_output)]
    started = time.perf_counter()
    log_event(f"抽取音轨：{args.input.resolve()}；源文件 {args.start:g}–"
              f"{args.start + target_duration:g} 秒 → {output.resolve()}")
    try:
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or f"ffmpeg 退出码 {result.returncode}")
        actual_duration = duration_seconds(temporary_output)
        if abs(actual_duration - target_duration) > 0.5:
            raise RuntimeError(f"音轨时长异常：期望 {target_duration:.2f} 秒，实际 {actual_duration:.2f} 秒")
        os.replace(temporary_output, output)
        sidecar = output.with_suffix(".source.json")
        sidecar.write_text(json.dumps({
            "source_file": str(args.input.resolve()),
            "start_seconds": args.start,
            "duration_seconds": actual_duration,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except RuntimeError as exc:
        parser.exit(1, f"抽取音轨失败：{exc}\n")
    finally:
        temporary_output.unlink(missing_ok=True)
    log_event(f"音轨已生成：{output.resolve()}（{output.stat().st_size / 1024**2:.1f} MiB）；"
              f"耗时 {time.perf_counter() - started:.2f} 秒")


if __name__ == "__main__":
    main()
