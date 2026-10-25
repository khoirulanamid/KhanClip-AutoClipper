#!/usr/bin/env python3
"""
KhanClip Local Runner & Bridge Server
Jalankan di laptop (Windows / Mac / Linux) untuk mengunduh video YouTube dengan koneksi lokal anti-blokir.
"""

import os
import sys
import json
import shutil
import mimetypes
import subprocess
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import webbrowser

PORT = 38281
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "dist")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

def get_ytdlp_command():
    # 1. Check ~/.local/bin/yt-dlp
    user_bin = os.path.expanduser("~/.local/bin/yt-dlp")
    if os.path.isfile(user_bin) and os.access(user_bin, os.X_OK):
        return [user_bin]

    # 2. Check system PATH
    sys_bin = shutil.which("yt-dlp")
    if sys_bin:
        return [sys_bin]

    # 3. Check python -m yt_dlp
    try:
        subprocess.run([sys.executable, "-m", "yt_dlp", "--version"], capture_output=True, check=True)
        return [sys.executable, "-m", "yt_dlp"]
    except Exception:
        pass

    # 4. Auto-install yt-dlp via pip if missing
    print("[KhanClip] Menyiapkan modul yt-dlp untuk pertama kali...")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "yt-dlp"], check=True)
        return [sys.executable, "-m", "yt_dlp"]
    except Exception as e:
        print(f"[KhanClip] Gagal auto-install yt-dlp: {e}")

    return ["yt-dlp"]

class KhanClipHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def translate_path(self, path):
        # Normalize GitHub Pages base path
        if path.startswith("/KhanClip-AutoClipper"):
            path = path[len("/KhanClip-AutoClipper"):] or "/"
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        # Normalize /KhanClip-AutoClipper base path
        if self.path.startswith("/KhanClip-AutoClipper"):
            self.path = self.path[len("/KhanClip-AutoClipper"):] or "/"

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/status" or path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "mode": "local-bridge", "version": "1.0.0"}).encode())
            return

        if path.startswith("/downloads/"):
            # Serve video from downloads folder with range support
            rel_path = path[len("/downloads/"):]
            full_path = os.path.join(DOWNLOADS_DIR, urllib.parse.unquote(rel_path))
            if os.path.isfile(full_path):
                self.serve_file_range(full_path)
                return

        # Fallback to SPA index.html for unknown routes
        target = os.path.join(DIST_DIR, path.lstrip("/"))
        if not os.path.exists(target) and not path.startswith("/assets/"):
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/KhanClip-AutoClipper"):
            self.path = self.path[len("/KhanClip-AutoClipper"):] or "/"

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/download":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(body)
                url = payload.get("url", "").strip()
                if not url:
                    raise ValueError("URL YouTube belum diisi.")

                print(f"[KhanClip] Mengunduh video dari laptop: {url}")
                result = self.download_video(url)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
            except Exception as e:
                print(f"[KhanClip] Error download: {e}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        self.send_response(404)
        self.end_headers()

    def download_video(self, url):
        cmd = get_ytdlp_command()

        # First extract info
        info_cmd = cmd + ["-J", "--no-warnings", url]
        proc = subprocess.run(info_cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "Gagal membaca informasi video YouTube.")

        info = json.loads(proc.stdout)
        title = info.get("title", "youtube_video")
        video_id = info.get("id", "video")
        duration = info.get("duration", 0)

        # Sanitize filename
        safe_title = "".join(c for c in title if c.isalnum() or c in (" ", "-", "_", ".")).rstrip()
        out_filename = f"{safe_title[:60]}_{video_id}.mp4"
        out_path = os.path.join(DOWNLOADS_DIR, out_filename)

        if not os.path.exists(out_path):
            print(f"[KhanClip] Mengunduh format 720p/HD ke {out_path}...")
            dl_cmd = cmd + [
                "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "-o", out_path,
                "--no-warnings",
                url
            ]
            dl_proc = subprocess.run(dl_cmd, capture_output=True, text=True, check=False)
            if dl_proc.returncode != 0 and not os.path.exists(out_path):
                raise RuntimeError(dl_proc.stderr.strip() or "Gagal mengunduh file video.")

        file_size = os.path.getsize(out_path)
        encoded_name = urllib.parse.quote(out_filename)
        return {
            "status": "ok",
            "url": f"/downloads/{encoded_name}",
            "filename": out_filename,
            "title": title,
            "duration": duration,
            "size": file_size
        }

    def serve_file_range(self, full_path):
        size = os.path.getsize(full_path)
        range_header = self.headers.get("Range")
        content_type = mimetypes.guess_type(full_path)[0] or "video/mp4"

        if not range_header:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(size))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            with open(full_path, "rb") as f:
                while chunk := f.read(65536):
                    self.wfile.write(chunk)
            return

        # Parse range header
        try:
            ranges = range_header.replace("bytes=", "").split("-")
            start = int(ranges[0])
            end = int(ranges[1]) if ranges[1] else size - 1
            start = max(0, min(start, size - 1))
            end = max(start, min(end, size - 1))
            length = end - start + 1

            self.send_response(206)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()

            with open(full_path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    read_size = min(65536, remaining)
                    chunk = f.read(read_size)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except Exception as e:
            self.send_response(416)
            self.end_headers()

    def log_message(self, format, *args):
        pass

def main():
    print("=" * 60)
    print("🚀 KhanClip Local Bridge Runner")
    print("=" * 60)
    print(f"Server aktif di http://127.0.0.1:{PORT}")
    print("Membuka browser otomatis...")
    print("Tekan Ctrl+C untuk menghentikan server.")
    print("=" * 60)

    server = HTTPServer(("127.0.0.1", PORT), KhanClipHandler)
    webbrowser.open(f"http://127.0.0.1:{PORT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[KhanClip] Server dihentikan.")
        server.server_close()

if __name__ == "__main__":
    main()
