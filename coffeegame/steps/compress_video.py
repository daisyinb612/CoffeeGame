#!/usr/bin/env python3
"""制作供视频理解使用的压缩副本，不修改原视频。"""

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
    """读取压缩参数，运行 ffmpeg，并报告生成文件。"""
    parser = argparse.ArgumentParser(description="压缩视频以供 Gemini 理解，保留原片")
    parser.add_argument("--input", type=Path, required=True, help="原视频路径")
    parser.add_argument("--output", type=Path, help="压缩视频路径；默认 test/<原视频名>_compressed.mp4")
    parser.add_argument("--width", type=int, default=720, help="输出画面宽度，默认 720")
    parser.add_argument("--fps", type=int, default=24, help="输出帧率，默认 24")
    parser.add_argument("--crf", type=int, default=37, help="H.264 压缩质量，0 最清晰、51 最模糊；默认 37")
    args = parser.parse_args()
    args.output = args.output or ROOT / "test" / f"{args.input.stem}_compressed.mp4"

    if not args.input.is_file():
        parser.error(f"输入视频不存在：{args.input}")
    if args.input.resolve() == args.output.resolve():
        parser.error("输出路径不能与输入视频相同")
    if args.width <= 0 or args.width % 2 or args.fps <= 0 or not 0 <= args.crf <= 51:
        parser.error("width 必须是正偶数，fps 必须大于 0，crf 必须在 0–51 之间")
    if not shutil.which("ffmpeg"):
        parser.error("找不到 ffmpeg")

    source_duration = duration_seconds(args.input)
    log_event(f"开始压缩：{args.input.resolve()} → {args.output.resolve()}；"
              f"原片 {args.input.stat().st_size / 1024**2:.1f} MiB、{source_duration:.1f} 秒；"
              f"宽度 {args.width}、帧率 {args.fps}、CRF {args.crf}")
    started = time.perf_counter()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".mp4", dir=args.output.parent, delete=False) as tmp:
        temporary_output = Path(tmp.name)
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(args.input),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", f"fps={args.fps},scale={args.width}:-2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", str(args.crf),
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "32k",
        "-movflags", "+faststart", "-y", str(temporary_output),
    ]
    try:
        subprocess.run(command, check=True)
        output_duration = duration_seconds(temporary_output)
        if abs(output_duration - source_duration) > 0.25:
            raise ValueError(f"压缩前后时长不一致：{source_duration:.2f} 秒 → {output_duration:.2f} 秒")
        os.replace(temporary_output, args.output)
    except subprocess.CalledProcessError as exc:
        log_event(f"压缩失败，耗时 {time.perf_counter() - started:.2f} 秒；ffmpeg 退出码 {exc.returncode}", "ERROR")
        parser.exit(1, f"压缩失败：ffmpeg 退出码 {exc.returncode}\n")
    except ValueError as exc:
        log_event(f"压缩失败，耗时 {time.perf_counter() - started:.2f} 秒；{exc}", "ERROR")
        parser.exit(1, f"压缩失败：{exc}\n")
    finally:
        temporary_output.unlink(missing_ok=True)
    log_event(f"压缩完成：{args.output}（{args.output.stat().st_size / 1024**2:.1f} MiB）；"
              f"耗时 {time.perf_counter() - started:.2f} 秒")


if __name__ == "__main__":
    main()
