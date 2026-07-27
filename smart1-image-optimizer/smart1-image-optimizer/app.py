from __future__ import annotations

import io
import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

from optimizer import OptimizationError, SUPPORTED_EXTENSIONS, optimize_image

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_UPLOAD_MB", "40")) * 1024 * 1024


def _optimized_name(filename: str) -> str:
    safe = secure_filename(filename) or "image"
    path = Path(safe)
    return f"{path.stem}-optimized{path.suffix.lower()}"


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/optimize")
def optimize():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Choose an image to upload."}), 400

    ext = Path(uploaded.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return jsonify({"error": "Only GIF, JPG, JPEG, and PNG files are supported."}), 400

    try:
        target_kb = int(request.form.get("target_kb", "150"))
    except ValueError:
        return jsonify({"error": "Target size must be a whole number of KB."}), 400

    target_kb = min(max(target_kb, 10), 5000)
    source = uploaded.read()

    try:
        result = optimize_image(source, uploaded.filename, target_kb=target_kb)
    except OptimizationError as exc:
        return jsonify({"error": str(exc)}), 422

    response = send_file(
        io.BytesIO(result.data),
        mimetype=uploaded.mimetype or "application/octet-stream",
        as_attachment=True,
        download_name=_optimized_name(uploaded.filename),
        max_age=0,
    )
    response.headers["X-Original-Bytes"] = str(result.original_bytes)
    response.headers["X-Optimized-Bytes"] = str(result.output_bytes)
    response.headers["X-Savings-Percent"] = f"{result.savings_pct:.1f}"
    response.headers["X-Output-Width"] = str(result.width)
    response.headers["X-Output-Height"] = str(result.height)
    return response


@app.errorhandler(413)
def too_large(_error):
    max_mb = os.getenv("MAX_UPLOAD_MB", "40")
    return jsonify({"error": f"File is too large. Maximum upload size is {max_mb} MB."}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "10000")), debug=False)
