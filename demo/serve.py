"""Serve the portrait demo with byte-range video playback."""
import argparse
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default as email_policy
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

from build_media import DEFAULT_SOURCE, ROOT

DEFAULT_PLAYBACK = ROOT / "media" / "story-full.mp4"


class DemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if urlsplit(self.path).path == "/api/rectified-skybox":
            if self.headers.get("X-CoffeeGame-Export") != "1" or self.headers.get("Origin") not in (None, f"http://{self.headers.get('Host')}"):
                self.send_error(403)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 32 * 1024 * 1024:
                    raise ValueError("图片大小不符合要求")
                data = self.rfile.read(length)
                if data[:8] != b"\x89PNG\r\n\x1a\n" or int.from_bytes(data[16:20], "big") != 4096 or int.from_bytes(data[20:24], "big") != 2048:
                    raise ValueError("需要 4096 × 2048 PNG")
                path = ROOT / "assets" / "scene-boxes" / "coffee-rectified-skybox-4096.png"
                temporary = path.with_suffix(".png.tmp")
                temporary.write_bytes(data)
                temporary.replace(path)
                self.send_response(200)
                self.send_header("Content-Length", "0")
                self.end_headers()
            except (ValueError, OSError) as error:
                self.send_error(400, str(error))
            return
        if urlsplit(self.path).path == "/api/scene-prompts":
            self.save_scene_prompts()
            return
        if urlsplit(self.path).path != "/api/scene-positions":
            self.send_error(404)
            return
        if self.headers.get("X-CoffeeGame-Upload") != "1":
            self.send_error(403, "Upload header required")
            return
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{self.headers.get('Host')}":
            self.send_error(403, "Origin mismatch")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            content_type = self.headers.get("Content-Type", "")
            if not 0 < length <= 90 * 1024 * 1024 or not content_type.startswith("multipart/form-data;"):
                raise ValueError("文件格式或总大小不符合要求")
            raw = self.rfile.read(length)
            message = BytesParser(policy=email_policy).parsebytes(
                b"MIME-Version: 1.0\r\nContent-Type: " + content_type.encode("ascii") + b"\r\n\r\n" + raw
            )
            fields = {}
            for part in message.iter_parts():
                name = part.get_param("name", header="content-disposition")
                if name in fields:
                    raise ValueError("上传字段重复")
                fields[name] = part.get_payload(decode=True)
            mapping = json.loads(fields["mapping"].decode("utf-8"))
            directions = ("front", "right", "back", "left")
            if set(mapping) != set(directions):
                raise ValueError("请设置前、右、后、左四个方向")
            asset_dir = ROOT / "assets" / "scene-boxes"
            result = {}
            uploads = []
            for direction in directions:
                choice = mapping[direction]
                if choice.get("kind") == "existing":
                    source = choice.get("source", "")
                    if source not in {"coffee-bar.jpg", "back-room.jpg", "lounge.jpg", "sink.jpg"} and not re.fullmatch(r"upload-(?:front|right|back|left)-[0-9a-f]{12}\.(?:jpg|png|webp)", source):
                        raise ValueError("包含未识别的照片")
                    if not (asset_dir / source).is_file():
                        raise ValueError("所选照片不存在")
                    result[direction] = source
                elif choice.get("kind") == "upload":
                    data = fields.get(f"file_{direction}", b"")
                    if not 0 < len(data) <= 20 * 1024 * 1024:
                        raise ValueError("每张照片需小于 20 MB")
                    if data.startswith(b"\xff\xd8\xff"):
                        extension = "jpg"
                    elif data.startswith(b"\x89PNG\r\n\x1a\n"):
                        extension = "png"
                    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
                        extension = "webp"
                    else:
                        raise ValueError("请上传 JPG、PNG 或 WebP 图片")
                    digest = hashlib.sha256(data).hexdigest()[:12]
                    filename = f"upload-{direction}-{digest}.{extension}"
                    uploads.append((asset_dir / filename, data))
                    result[direction] = filename
                else:
                    raise ValueError("请选择每个方向的照片")
            if len(set(result.values())) != 4:
                raise ValueError("四个方向需要使用四张不同照片")
            for path, data in uploads:
                if not path.exists():
                    path.write_bytes(data)
            manifest = {"updated_at": datetime.now(timezone.utc).isoformat(), "faces": result}
            manifest_path = asset_dir / "scene-positions.json"
            temporary = asset_dir / "scene-positions.json.tmp"
            temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporary.replace(manifest_path)
            body = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (KeyError, ValueError, UnicodeError, json.JSONDecodeError) as error:
            self.send_error(400, str(error))

    def save_scene_prompts(self):
        if self.headers.get("X-CoffeeGame-Prompts") != "1":
            self.send_error(403, "Prompt header required")
            return
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{self.headers.get('Host')}":
            self.send_error(403, "Origin mismatch")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 30_000 or self.headers.get("Content-Type", "").split(";", 1)[0] != "application/json":
                raise ValueError("Prompt 数据格式或大小不符合要求")
            request = json.loads(self.rfile.read(length).decode("utf-8"))
            prompts = request["prompts"]
            if set(prompts) != {"front", "right", "back", "left", "panorama"}:
                raise ValueError("请提供五张图的 Prompt")
            if any(not isinstance(value, str) or len(value) > 5000 for value in prompts.values()):
                raise ValueError("每条 Prompt 最多 5000 字")
            document = {"updated_at": datetime.now(timezone.utc).isoformat(), "prompts": prompts}
            path = ROOT / "assets" / "scene-boxes" / "scene-prompts.json"
            temporary = path.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            temporary.replace(path)
            body = json.dumps(document, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (KeyError, ValueError, UnicodeError, json.JSONDecodeError) as error:
            self.send_error(400, str(error))

    def send_head(self):
        self.video_bytes = None
        path = urlsplit(self.path).path
        if path == "/media/story-full.mp4":
            video = self.server.playback
        elif path == "/media/story-original.mp4":
            video = self.server.source
        else:
            return super().send_head()

        try:
            source = video.open("rb")
        except OSError:
            self.send_error(404, "Lesson recording not found")
            return None

        size = os.fstat(source.fileno()).st_size
        start, end = 0, size - 1
        requested = self.headers.get("Range")
        if requested:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested.strip())
            if match:
                first, last = match.groups()
                if first:
                    start = int(first)
                    if last:
                        end = min(end, int(last))
                elif last:
                    start = max(0, size - int(last))
                else:
                    start = size
            else:
                start = size

        if start > end:
            source.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None

        self.video_bytes = end - start + 1
        source.seek(start)
        self.send_response(206 if requested else 200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(self.video_bytes))
        if requested:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        return source

    def copyfile(self, source, outputfile):
        if self.video_bytes is None:
            return super().copyfile(source, outputfile)
        remaining = self.video_bytes
        try:
            while remaining:
                chunk = source.read(min(remaining, 256 * 1024))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # A media player can cancel one range and immediately request another.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="IPv4 listen address (use 0.0.0.0 for local network access)")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--source", type=Path, help="Override the lesson recording")
    args = parser.parse_args()
    playback = (args.source or DEFAULT_PLAYBACK).resolve(strict=True)
    with ThreadingHTTPServer((args.host, args.port), DemoHandler) as server:
        server.source = playback if args.source else DEFAULT_SOURCE
        server.playback = playback
        host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
        print(f"http://{host}:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
