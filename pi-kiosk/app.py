"""Flask web app for FW Attendance Kiosk touchscreen UI."""

import json
import logging
import threading
import time
from datetime import datetime

import cv2
from flask import Flask, Response, jsonify, render_template, request

import config
import database

logger = logging.getLogger(__name__)

app = Flask(__name__)

# Shared state (set by kiosk.py main loop)
_state_lock = threading.Lock()
_current_state = {
    "status": "idle",  # idle, recognized, unknown, error
    "worker_name": None,
    "event_type": None,
    "message": "",
    "timestamp": None,
    "server_online": False,
    "known_faces": 0,
}

# Camera frame shared with main loop
_frame_lock = threading.Lock()
_current_frame = None


def update_state(status: str, worker_name: str = None, event_type: str = None,
                 message: str = "", server_online: bool = False, known_faces: int = 0):
    """Update the shared UI state."""
    with _state_lock:
        _current_state["status"] = status
        _current_state["worker_name"] = worker_name
        _current_state["event_type"] = event_type
        _current_state["message"] = message
        _current_state["timestamp"] = datetime.now().isoformat()
        _current_state["server_online"] = server_online
        _current_state["known_faces"] = known_faces


def set_frame(frame):
    """Update the current camera frame for MJPEG streaming."""
    global _current_frame
    with _frame_lock:
        _current_frame = frame


def _generate_frames():
    """Generator that yields MJPEG frames."""
    while True:
        with _frame_lock:
            frame = _current_frame
        if frame is not None:
            ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if ret:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
                )
        time.sleep(0.05)  # ~20 FPS max


@app.route("/")
def index():
    """Main kiosk view."""
    return render_template("index.html", kiosk_type=config.KIOSK_TYPE, kiosk_name=config.KIOSK_NAME)


@app.route("/video_feed")
def video_feed():
    """MJPEG video stream."""
    return Response(_generate_frames(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/status")
def status():
    """JSON current state."""
    with _state_lock:
        state = dict(_current_state)
    state["kiosk_type"] = config.KIOSK_TYPE
    state["kiosk_name"] = config.KIOSK_NAME
    state["kiosk_id"] = config.KIOSK_ID
    return jsonify(state)


@app.route("/manual_clock", methods=["POST"])
def manual_clock():
    """Manual clock-in/out by name (fallback)."""
    data = request.get_json()
    if not data or "name" not in data:
        return jsonify({"error": "Name required"}), 400

    name = data["name"].strip()
    if not name:
        return jsonify({"error": "Name required"}), 400

    event_type = "clock_in" if config.KIOSK_TYPE == "entry" else "clock_out"

    # Find worker by name
    workers = database.get_all_workers()
    worker = next((w for w in workers if w["name"].lower() == name.lower()), None)

    if worker:
        worker_id = worker["id"]
    else:
        # Log with id=0 for unknown manual entries
        worker_id = 0

    database.log_attendance(worker_id, name, event_type, confidence=0.0)
    update_state("recognized", worker_name=name, event_type=event_type,
                 message=f"Manual {event_type.replace('_', ' ')} for {name}")

    return jsonify({"success": True, "name": name, "event_type": event_type})


@app.route("/today")
def today():
    """Today's attendance log."""
    logs = database.get_today_logs()
    return jsonify(logs)


def start_server():
    """Start Flask server in a background thread."""
    thread = threading.Thread(
        target=lambda: app.run(
            host=config.FLASK_HOST,
            port=config.FLASK_PORT,
            debug=False,
            use_reloader=False,
            threaded=True,
        ),
        daemon=True,
        name="flask-server",
    )
    thread.start()
    logger.info("Flask server started on %s:%d", config.FLASK_HOST, config.FLASK_PORT)
    return thread
