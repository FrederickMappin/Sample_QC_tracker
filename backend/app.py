"""
Flask backend for QC Metrics Dashboard.
Run:  python app.py
"""

import os
import threading
import webbrowser

from flask import Flask, request, jsonify, send_from_directory
from database import QCDatabase

# ── paths ────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── app setup ────────────────────────────────────────────────────
app = Flask(__name__, static_folder=FRONTEND_DIR)
db = QCDatabase()

# ── static file serving ─────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/css/<path:filename>")
def serve_css(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, "css"), filename)


@app.route("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, "js"), filename)


# ── API endpoints ────────────────────────────────────────────────

@app.route("/upload", methods=["POST"])
def upload():
    """Receive parquet file, load into DuckDB, return column info."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    f = request.files["file"]
    if not f.filename or not f.filename.lower().endswith(".parquet"):
        return jsonify({"error": "File must be a .parquet file"}), 400

    filepath = os.path.join(UPLOAD_DIR, "current.parquet")
    f.save(filepath)

    try:
        info = db.load_parquet(filepath)
        return jsonify({"success": True, **info})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/filters", methods=["GET"])
def filters():
    """Return current filter options."""
    if not db.loaded:
        return jsonify({"error": "No data loaded. Upload a parquet file first."}), 400
    return jsonify(db.get_filter_options())


@app.route("/query", methods=["POST"])
def query():
    """Return filtered rows."""
    if not db.loaded:
        return jsonify({"error": "No data loaded. Upload a parquet file first."}), 400

    body = request.get_json(silent=True) or {}
    filters = body.get("filters", {})

    try:
        data = db.query_data(filters)
        return jsonify({"data": data, "count": len(data), "total": db.total_rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/stats", methods=["POST"])
def stats():
    """Return box-plot statistics for filtered data."""
    if not db.loaded:
        return jsonify({"error": "No data loaded. Upload a parquet file first."}), 400

    body = request.get_json(silent=True) or {}
    filters = body.get("filters", {})

    try:
        return jsonify(db.get_stats(filters))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── startup ──────────────────────────────────────────────────────

def open_browser():
    webbrowser.open("http://127.0.0.1:5000")


if __name__ == "__main__":
    print("🧬  QC Metrics Dashboard running at http://127.0.0.1:5000")
    threading.Timer(1.2, open_browser).start()
    app.run(host="127.0.0.1", port=5000, debug=False)
