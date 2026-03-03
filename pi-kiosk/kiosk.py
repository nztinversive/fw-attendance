#!/usr/bin/env python3
"""
FW Gatekeeper - Pi Kiosk Face Scanner

Runs locally on a Raspberry Pi 3B with camera.
- Captures face from camera
- Matches against locally cached worker encodings
- Logs clock in/out locally
- Syncs with FW Gatekeeper server when WiFi is available

Usage:
    python3 kiosk.py [--server URL] [--kiosk-id ID] [--camera usb|pi] [--threshold 0.6]
"""

import argparse
import json
import os
import sys
import time
import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import face_recognition
from PIL import Image

# ─── Configuration ──────────────────────────────────────────────

DATA_DIR = Path(__file__).parent / "data"
ENCODINGS_FILE = DATA_DIR / "encodings.json"
ATTENDANCE_LOG = DATA_DIR / "attendance_offline.json"
CONFIG_FILE = DATA_DIR / "config.json"

DEFAULT_SERVER = "https://fw-gatekeeper.onrender.com"
MATCH_THRESHOLD = 0.6
CAPTURE_WIDTH = 640
CAPTURE_HEIGHT = 480
COOLDOWN_SECONDS = 30  # prevent duplicate scans

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("kiosk")


# ─── Camera Abstraction ────────────────────────────────────────

class Camera:
    """Abstract camera that works with Pi Camera or USB webcam."""

    def __init__(self, mode: str = "auto"):
        self._cam = None
        self._mode = mode

    def start(self):
        if self._mode in ("pi", "auto"):
            try:
                from picamera2 import Picamera2
                self._cam = Picamera2()
                config = self._cam.create_still_configuration(
                    main={"size": (CAPTURE_WIDTH, CAPTURE_HEIGHT), "format": "RGB888"}
                )
                self._cam.configure(config)
                self._cam.start()
                time.sleep(1)  # warm up
                self._mode = "pi"
                log.info("Pi Camera initialized")
                return
            except Exception as e:
                if self._mode == "pi":
                    raise RuntimeError(f"Pi Camera failed: {e}")
                log.info(f"Pi Camera not available ({e}), trying USB...")

        # USB webcam fallback via OpenCV
        try:
            import cv2
            self._cam = cv2.VideoCapture(0)
            self._cam.set(cv2.CAP_PROP_FRAME_WIDTH, CAPTURE_WIDTH)
            self._cam.set(cv2.CAP_PROP_FRAME_HEIGHT, CAPTURE_HEIGHT)
            if not self._cam.isOpened():
                raise RuntimeError("USB camera not found")
            self._mode = "usb"
            log.info("USB Camera initialized")
        except Exception as e:
            raise RuntimeError(f"No camera available: {e}")

    def capture(self) -> np.ndarray:
        """Capture a frame as RGB numpy array."""
        if self._mode == "pi":
            return self._cam.capture_array()
        else:
            import cv2
            ret, frame = self._cam.read()
            if not ret:
                raise RuntimeError("Failed to capture frame")
            return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    def stop(self):
        if self._cam is None:
            return
        if self._mode == "pi":
            self._cam.stop()
        else:
            self._cam.release()


# ─── Encoding Storage ──────────────────────────────────────────

class EncodingStore:
    """Manages worker face encodings - syncs from server, caches locally."""

    def __init__(self, server_url: str):
        self.server_url = server_url.rstrip("/")
        self.workers: dict[str, dict] = {}  # id -> {name, department, encoding}
        self._load_cache()

    def _load_cache(self):
        if ENCODINGS_FILE.exists():
            try:
                data = json.loads(ENCODINGS_FILE.read_text())
                self.workers = data.get("workers", {})
                log.info(f"Loaded {len(self.workers)} cached worker encodings")
            except Exception as e:
                log.warning(f"Failed to load encoding cache: {e}")

    def _save_cache(self):
        ENCODINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        ENCODINGS_FILE.write_text(json.dumps({
            "workers": self.workers,
            "last_sync": datetime.now(timezone.utc).isoformat(),
        }, indent=2))

    def sync(self) -> bool:
        """Pull latest worker encodings from server. Returns True if successful."""
        import requests
        try:
            # Get all workers with encodings
            res = requests.get(f"{self.server_url}/api/workers?include_encodings=true", timeout=10)
            if res.status_code != 200:
                log.warning(f"Sync failed: server returned {res.status_code}")
                return False

            workers_data = res.json()
            synced = 0
            for w in workers_data:
                if w.get("face_encoding"):
                    self.workers[w["id"]] = {
                        "name": w["name"],
                        "department": w.get("department", ""),
                        "encoding": w["face_encoding"],
                    }
                    synced += 1

            self._save_cache()
            log.info(f"Synced {synced} worker encodings from server")
            return True

        except requests.ConnectionError:
            log.warning("Server unreachable - using cached encodings")
            return False
        except Exception as e:
            log.warning(f"Sync error: {e}")
            return False

    def match(self, face_encoding: np.ndarray, threshold: float = MATCH_THRESHOLD) -> Optional[dict]:
        """Match a face encoding against known workers. Returns {id, name, confidence} or None."""
        if not self.workers:
            return None

        known_ids = []
        known_encodings = []
        for wid, data in self.workers.items():
            enc = data.get("encoding")
            if enc:
                known_ids.append(wid)
                known_encodings.append(np.array(enc))

        if not known_encodings:
            return None

        distances = face_recognition.face_distance(known_encodings, face_encoding)
        best_idx = int(np.argmin(distances))
        best_dist = distances[best_idx]

        if best_dist > threshold:
            return None

        wid = known_ids[best_idx]
        return {
            "id": wid,
            "name": self.workers[wid]["name"],
            "department": self.workers[wid].get("department", ""),
            "confidence": round(1.0 - best_dist, 4),
        }


# ─── Attendance Logger ─────────────────────────────────────────

class AttendanceLogger:
    """Logs events locally and syncs to server when possible."""

    def __init__(self, server_url: str, kiosk_id: str):
        self.server_url = server_url.rstrip("/")
        self.kiosk_id = kiosk_id
        self.pending: list[dict] = []
        self._load_pending()
        self._last_scan: dict[str, float] = {}  # worker_id -> timestamp

    def _load_pending(self):
        if ATTENDANCE_LOG.exists():
            try:
                self.pending = json.loads(ATTENDANCE_LOG.read_text())
                if self.pending:
                    log.info(f"{len(self.pending)} pending gatekeeper records to sync")
            except Exception:
                self.pending = []

    def _save_pending(self):
        ATTENDANCE_LOG.parent.mkdir(parents=True, exist_ok=True)
        ATTENDANCE_LOG.write_text(json.dumps(self.pending, indent=2))

    def is_cooldown(self, worker_id: str) -> bool:
        """Check if worker was scanned recently (prevent duplicate scans)."""
        last = self._last_scan.get(worker_id, 0)
        return (time.time() - last) < COOLDOWN_SECONDS

    def log_scan(self, worker_id: str, worker_name: str, confidence: float):
        """Record a scan event."""
        now = datetime.now(timezone.utc).isoformat()
        self._last_scan[worker_id] = time.time()

        record = {
            "worker_id": worker_id,
            "worker_name": worker_name,
            "kiosk_id": self.kiosk_id,
            "timestamp": now,
            "confidence": confidence,
        }
        self.pending.append(record)
        self._save_pending()
        log.info(f"Logged: {worker_name} (confidence: {confidence})")

    def sync(self) -> int:
        """Push pending records to server. Returns count synced."""
        if not self.pending:
            return 0

        import requests
        synced = 0
        remaining = []

        for record in self.pending:
            try:
                res = requests.post(
                    f"{self.server_url}/api/attendance",
                    json={
                        "worker_id": record["worker_id"],
                        "type": "clock_in",  # kiosk scans are clock-ins
                        "kiosk_id": record["kiosk_id"],
                        "timestamp": record["timestamp"],
                    },
                    timeout=10,
                )
                if res.status_code in (200, 201):
                    synced += 1
                else:
                    remaining.append(record)
            except Exception:
                remaining.append(record)

        self.pending = remaining
        self._save_pending()
        if synced:
            log.info(f"Synced {synced} gatekeeper records to server")
        return synced


# ─── Display (Terminal UI) ─────────────────────────────────────

def clear_screen():
    os.system("clear" if os.name != "nt" else "cls")


def show_status(message: str, color: str = "white"):
    """Show a status message in the terminal (kiosk display)."""
    colors = {
        "green": "\033[92m",
        "red": "\033[91m",
        "gold": "\033[93m",
        "white": "\033[97m",
        "reset": "\033[0m",
    }
    c = colors.get(color, colors["white"])
    r = colors["reset"]
    clear_screen()
    print(f"\n{'=' * 50}")
    print(f"  {colors['gold']}FW{r} Gatekeeper Kiosk")
    print(f"{'=' * 50}")
    print(f"\n  {c}{message}{r}\n")
    print(f"{'=' * 50}")


# ─── Main Loop ─────────────────────────────────────────────────

def run_kiosk(args):
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    show_status("Starting up...", "gold")

    # Init camera
    camera = Camera(mode=args.camera)
    try:
        camera.start()
    except RuntimeError as e:
        show_status(f"Camera error: {e}", "red")
        sys.exit(1)

    # Init encoding store + attendance logger
    store = EncodingStore(args.server)
    logger = AttendanceLogger(args.server, args.kiosk_id)

    # Initial sync
    show_status("Syncing worker data...", "gold")
    store.sync()
    logger.sync()

    if not store.workers:
        show_status("No enrolled workers found!\nEnroll faces at the web app first.", "red")
        time.sleep(5)

    last_sync = time.time()
    SYNC_INTERVAL = 300  # re-sync every 5 minutes

    show_status("Ready - Look at the camera", "green")

    try:
        while True:
            # Periodic sync
            if time.time() - last_sync > SYNC_INTERVAL:
                store.sync()
                logger.sync()
                last_sync = time.time()

            # Capture frame
            try:
                frame = camera.capture()
            except Exception as e:
                log.error(f"Capture error: {e}")
                time.sleep(1)
                continue

            # Detect faces
            face_locations = face_recognition.face_locations(frame, model="hog")

            if not face_locations:
                show_status("Ready - Look at the camera", "green")
                time.sleep(0.5)
                continue

            # Get encoding for the first/largest face
            encodings = face_recognition.face_encodings(frame, face_locations)
            if not encodings:
                time.sleep(0.5)
                continue

            face_enc = encodings[0]

            # Match against known workers
            match = store.match(face_enc, threshold=args.threshold)

            if match:
                if logger.is_cooldown(match["id"]):
                    show_status(
                        f"✅ Welcome, {match['name']}!\n   Already scanned - please proceed.",
                        "green"
                    )
                else:
                    logger.log_scan(match["id"], match["name"], match["confidence"])
                    show_status(
                        f"✅ Welcome, {match['name']}!\n"
                        f"   Department: {match['department']}\n"
                        f"   Confidence: {match['confidence']:.0%}\n"
                        f"   Time: {datetime.now().strftime('%I:%M %p')}",
                        "green"
                    )
            else:
                show_status("❌ Face not recognized\n   Please see a manager.", "red")

            time.sleep(3)  # Show result for 3 seconds
            show_status("Ready - Look at the camera", "green")

    except KeyboardInterrupt:
        log.info("Shutting down...")
    finally:
        camera.stop()
        # Final sync attempt
        logger.sync()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FW Gatekeeper Pi Kiosk")
    parser.add_argument("--server", default=DEFAULT_SERVER, help="FW Gatekeeper server URL")
    parser.add_argument("--kiosk-id", default="kiosk-1", help="Unique kiosk identifier")
    parser.add_argument("--camera", choices=["auto", "pi", "usb"], default="auto", help="Camera type")
    parser.add_argument("--threshold", type=float, default=MATCH_THRESHOLD, help="Face match threshold (0-1, lower=stricter)")

    args = parser.parse_args()
    run_kiosk(args)
