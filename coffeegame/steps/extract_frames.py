#!/usr/bin/env python3
"""从视频按固定间隔抽取带时间索引的 JPEG 帧。"""

import argparse
import json
import math
import subprocess
import tempfile
from pathlib import Path

from coffeegame import PROJECT_ROOT
from coffeegame.core.logging_utils import log_event
from coffeegame.core.video_metadata import duration_seconds


def extract(video, output_dir, fps=1.0, width=768):
    """生成帧文件和 manifest.json；帧时间为固定采样网格上的秒数。"""
    if not video.is_file():
        raise ValueError(f"视频不存在：{video}")
    if not math.isfinite(fps) or fps <= 0 or fps > 4:
        raise ValueError("fps 必须在 0 到 4 之间")
    if width < 320 or width > 1920:
        raise ValueError("width 必须在 320 到 1920 之间")
    duration = duration_seconds(video)
    output_dir.mkdir(parents=True, exist_ok=True)
    pattern = output_dir / "frame_%05d.jpg"
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
               "-vf", f"fps={fps:g},scale={width}:-2", "-q:v", "5", "-y", str(pattern)]
    log_event(f"抽取视频帧：{video.resolve()}；采样 {fps:g} 帧/秒，宽度 {width}")
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"ffmpeg 退出码 {result.returncode}")
    paths = sorted(output_dir.glob("frame_*.jpg"))
    if not paths:
        raise RuntimeError("没有生成视频帧")
    frames = [{"time_seconds": round(index / fps, 3), "file": path.name}
              for index, path in enumerate(paths)
              if index / fps < duration + 0.25]
    manifest = {"source_video": str(video.resolve()), "duration_seconds": duration,
                "fps": fps, "width": width, "frames": frames}
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json",
                                     dir=output_dir, delete=False) as tmp:
        json.dump(manifest, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        temporary = Path(tmp.name)
    temporary.replace(output_dir / "manifest.json")
    log_event(f"视频帧已生成：{len(frames)} 帧；索引 {output_dir / 'manifest.json'}")
    return manifest


def main():
    """解析参数并抽帧。"""
    parser = argparse.ArgumentParser(description="按固定时间间隔抽取视频帧")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, help="默认 test/<视频名>_frames")
    parser.add_argument("--fps", type=float, default=1.0)
    parser.add_argument("--width", type=int, default=768)
    args = parser.parse_args()
    try:
        output_dir = args.output_dir or PROJECT_ROOT / "test" / f"{args.input.stem}_frames"
        extract(args.input, output_dir, args.fps, args.width)
    except (OSError, ValueError, RuntimeError) as exc:
        log_event(f"抽帧失败：{exc}", "ERROR")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
