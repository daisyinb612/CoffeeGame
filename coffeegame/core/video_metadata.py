"""视频工具共用的 ffprobe 元数据读取。"""

import json
import math
import shutil
import subprocess
from pathlib import Path


def duration_seconds(path: Path) -> float:
    """返回视频时长（秒）；文件无效或缺少 ffprobe 时明确报错。"""
    if not path.is_file():
        raise ValueError(f"视频不存在：{path}")
    if not shutil.which("ffprobe"):
        raise ValueError("找不到 ffprobe")
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "json", str(path)],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"无法读取视频元数据：{path}（{exc.stderr.strip()}）") from exc
    try:
        duration = float(json.loads(result.stdout)["format"]["duration"])
    except (KeyError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError(f"无法读取视频时长：{path}") from exc
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError(f"视频时长无效：{path}")
    return duration
