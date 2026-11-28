"""Build the lesson media from the repository's first-person recording."""
import argparse
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parent
DEFAULT_SOURCE = ROOT.parent / "source" / "冰美式第一人称视频.MP4"


def ffmpeg(*args):
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *map(str, args)],
        check=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--story", action="store_true", help="generate the short drama poster")
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    media = ROOT / "media"
    media.mkdir(exist_ok=True)
    if args.story:
        ffmpeg("-ss", 7.5, "-i", source, "-frames:v", "1",
               "-q:v", "2", media / "story-full.jpg")
        return

    steps = json.loads((ROOT / "lesson.json").read_text())["steps"]
    with TemporaryDirectory(dir=media) as temp:
        scratch = Path(temp)
        for step in steps:
            name = step["id"]
            print(f"制作 {step['title']}", flush=True)
            ranges = step.get("ranges")
            if ranges:
                for i, (start, end) in enumerate(ranges):
                    ffmpeg("-ss", start, "-i", source, "-t", end - start,
                           "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1",
                           "-vf", "scale=960:-2,fps=24", "-c:v", "libx264", "-preset", "veryfast",
                           "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
                           scratch / f"{i}.mp4")
                listing = scratch / "clips.txt"
                listing.write_text("".join(f"file '{i}.mp4'\n" for i in range(len(ranges))))
                movie = scratch / f"{name}.mp4"
                ffmpeg("-f", "concat", "-i", listing, "-c", "copy", "-movflags", "+faststart", movie)
                movie.replace(media / movie.name)
            marker = ranges[0][0] + 1 if ranges else step["still"]
            poster = scratch / f"{name}.jpg"
            ffmpeg("-ss", marker, "-i", source, "-frames:v", "1", "-vf", "scale=960:-2",
                   "-q:v", "3", poster)
            poster.replace(media / poster.name)


if __name__ == "__main__":
    main()
