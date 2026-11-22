"""Serve the portrait demo and stream the original recording locally."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit

from build_media import DEFAULT_SOURCE, ROOT


class DemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        self.video_bytes = None
        if urlsplit(self.path).path != "/media/story-original.mp4":
            return super().send_head()

        try:
            source = self.server.source.open("rb")
        except OSError:
            self.send_error(404, "Original recording not found")
            return None

        size = self.server.source_size
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
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    with ThreadingHTTPServer(("127.0.0.1", args.port), DemoHandler) as server:
        server.source = source
        server.source_size = source.stat().st_size
        print(f"http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
