"""
Warpspeed — YouTube to MP3 extraction service for wahzammo.com

Runs on GCP Cloud Run. Uses yt-dlp + ffmpeg to extract audio from
YouTube videos and stream back MP3 files.
"""

import os
import re
import tempfile
import time
from collections import defaultdict
from functools import wraps

from flask import Flask, request, send_file, jsonify

import yt_dlp

app = Flask(__name__)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

ALLOWED_ORIGINS = [
    "https://wahzammo.com",
    "https://www.wahzammo.com",
]


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
    elif os.environ.get("FLASK_DEBUG"):
        # Allow any origin in local dev
        response.headers["Access-Control-Allow-Origin"] = "*"

    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def cors_preflight(path):
    return "", 204


# ---------------------------------------------------------------------------
# Rate Limiting (in-memory, per-instance, resets on cold start)
# ---------------------------------------------------------------------------

RATE_LIMIT = 10  # requests per window
RATE_WINDOW = 900  # 15 minutes in seconds
_rate_store: dict[str, list[float]] = defaultdict(list)


def rate_limited(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        ip = request.headers.get("X-Forwarded-For", request.remote_addr)
        if ip:
            ip = ip.split(",")[0].strip()

        now = time.time()
        # Prune old entries
        _rate_store[ip] = [t for t in _rate_store[ip] if now - t < RATE_WINDOW]

        if len(_rate_store[ip]) >= RATE_LIMIT:
            return jsonify({"error": "Rate limit exceeded. Try again later."}), 429

        _rate_store[ip].append(now)
        return f(*args, **kwargs)

    return decorated


# ---------------------------------------------------------------------------
# YouTube URL validation
# ---------------------------------------------------------------------------

YT_PATTERN = re.compile(
    r"(youtube\.com/watch|youtu\.be/|youtube\.com/shorts/)", re.IGNORECASE
)

MAX_DURATION = 20 * 60  # 20 minutes in seconds


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/convert", methods=["GET"])
@rate_limited
def convert():
    url = request.args.get("url", "").strip()

    if not url:
        return jsonify({"error": "Missing 'url' parameter."}), 400

    if not YT_PATTERN.search(url):
        return jsonify({"error": "Invalid YouTube URL."}), 400

    tmpdir = None
    try:
        # Pre-flight: check duration without downloading
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True}) as ydl:
            info = ydl.extract_info(url, download=False)
            duration = info.get("duration", 0) or 0

            if duration > MAX_DURATION:
                return jsonify({
                    "error": f"Video too long ({duration // 60}:{duration % 60:02d}). "
                             f"Max allowed is {MAX_DURATION // 60} minutes."
                }), 400

        # Download and convert to MP3
        tmpdir = tempfile.mkdtemp()
        outtmpl = os.path.join(tmpdir, "%(id)s.%(ext)s")

        ydl_opts = {
            "format": "bestaudio/best",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "outtmpl": outtmpl,
            "noplaylist": True,
            "max_filesize": 50_000_000,  # 50 MB
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Find the resulting MP3 file
        mp3_files = [f for f in os.listdir(tmpdir) if f.endswith(".mp3")]
        if not mp3_files:
            return jsonify({"error": "Audio extraction failed — no MP3 produced."}), 500

        mp3_path = os.path.join(tmpdir, mp3_files[0])

        return send_file(
            mp3_path,
            mimetype="audio/mpeg",
            as_attachment=True,
            download_name="warpspeed_audio.mp3",
        )

    except yt_dlp.utils.DownloadError as e:
        msg = str(e)
        # Strip yt-dlp's verbose error prefix
        if "ERROR:" in msg:
            msg = msg.split("ERROR:")[-1].strip()
        return jsonify({"error": f"Download failed: {msg}"}), 422

    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

    finally:
        # Cleanup temp files
        if tmpdir:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Entry point (for local dev — gunicorn handles production)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=True)
