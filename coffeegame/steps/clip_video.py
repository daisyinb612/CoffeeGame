#!/usr/bin/env python3
"""从视频中截取指定时间范围，生成可单独分析的 MP4 片段。"""

import argparse
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from coffeegame import PROJECT_ROOT
from coffeegame.core.video_metadata import duration_seconds
from coffeegame.core.logging_utils import log_event


ROOT = PROJECT_ROOT


def main():
    """按起点和时长截片，保留原视频的画面尺寸、帧率和音频。"""
    parser = argparse.ArgumentParser(description="截取 MP4 视频片段")
    parser.add_argument("--input", type=Path, required=True, help="输入视频路径")
    parser.add_argument("--output", type=Path, help="输出片段路径；默认 test/<输入视频名>_clip_<起止秒>.mp4")
    parser.add_argument("--start", type=float, default=0, help="开始时间，单位秒")
    parser.add_argument("--duration", type=float, default=60, help="片段时长，单位秒")
    args = parser.parse_args()
    start_label = f"{args.start:g}".replace(".", "p")
    end_label = f"{args.start + args.duration:g}".replace(".", "p")
    args.output = args.output or ROOT / "test" / f"{args.input.stem}_clip_{start_label}_{end_label}.mp4"

    if not args.input.is_file():
        parser.error(f"输入视频不存在：{args.input}")
    if args.input.resolve() == args.output.resolve():
        parser.error("输出路径不能与输入视频相同")
    if args.start < 0 or args.duration <= 0:
        parser.error("start 必须大于等于 0，duration 必须大于 0")
    if not shutil.which("ffmpeg"):
        parser.error("找不到 ffmpeg")
    source_duration = duration_seconds(args.input)
    if args.start + args.duration > source_duration + 0.05:
        parser.error(f"请求到 {args.start + args.duration:g} 秒，但输入视频只有 {source_duration:.2f} 秒")

    log_event(f"开始截取：{args.input.resolve()}；区间 {args.start:g}–{args.start + args.duration:g} 秒；"
              f"输出 {args.output.resolve()}")
    started = time.perf_counter()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".mp4", dir=args.output.parent, delete=False) as tmp:
        temporary_output = Path(tmp.name)
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(args.start),
        "-i", str(args.input), "-t", str(args.duration),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "37",
        "-c:a", "aac", "-b:a", "32k", "-movflags", "+faststart",
        "-y", str(temporary_output),
    ]
    try:
        subprocess.run(command, check=True)
        actual_duration = duration_seconds(temporary_output)
        if abs(actual_duration - args.duration) > 0.25:
            raise ValueError(f"截片时长异常：期望 {args.duration:g} 秒，实际 {actual_duration:.2f} 秒")
        os.replace(temporary_output, args.output)
    except subprocess.CalledProcessError as exc:
        log_event(f"截取失败，耗时 {time.perf_counter() - started:.2f} 秒；ffmpeg 退出码 {exc.returncode}", "ERROR")
        parser.exit(1, f"截片失败：ffmpeg 退出码 {exc.returncode}\n")
    except ValueError as exc:
        log_event(f"截取失败，耗时 {time.perf_counter() - started:.2f} 秒；{exc}", "ERROR")
        parser.exit(1, f"截片失败：{exc}\n")
    finally:
        temporary_output.unlink(missing_ok=True)
    log_event(f"截取完成：{args.output}；耗时 {time.perf_counter() - started:.2f} 秒")


if __name__ == "__main__":
    main()
