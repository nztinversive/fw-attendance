#!/usr/bin/env python3
"""
FW Gatekeeper — Pi Kiosk Main Entry Point

Runs the face recognition scanner AND the Flask web UI together.
The web UI shows live camera feed, welcome/denied status, and today's log.
Connect a monitor via HDMI and run Chromium in kiosk mode for the display.

Usage:
    python main.py [--server URL] [--kiosk-id ID] [--camera auto|pi|usb]
"""

import argparse
import logging
import os
import sys
import time
import threading
from datetime import datetime, timedelta

import cv2
import numpy as np

import config
import database
from recognition import FaceRecognizer
from sync import SyncWorker
import app as web_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

# ─── Camera ────────────────────────────────────────────────────

class Camera:
    """Camera abstraction — Pi Camera or USB webcam."""

    def __init__(self, mode: str = "auto"):
        self._cam = None
        self._mode = mode

    def start(self):
        if self._mode in ("pi", "auto"):
            try:
                from picamera2 import Picamera2
                self._cam = Picamera2()
                cam_config = self._cam.create_still_configuration(
                    main={"size": (config.CAMERA_WIDTH, config.CAMERA_HEIGHT), "format": "RGB888"}
                )
                self._cam.configure(cam_config)
                self._cam.start()
                time.sleep(1)
                self._mode = "pi"
                logger.info("Pi Camera initialized")
                return
            except Exception as e:
                if self._mode == "pi":
                    raise RuntimeError(f"Pi Camera failed: {e}")
                logger.info(f"Pi Camera not available ({e}), trying USB...")

        self._cam = cv2.VideoCapture(config.CAMERA_INDEX)
        self._cam.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
        self._cam.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)
        if not self._cam.isOpened():
            raise RuntimeError("No camera available")
        self._mode = "usb"
        logger.info("USB Camera initialized")

    def capture_bgr(self) -> np.ndarray:
        """Capture a frame as BGR numpy array."""
        if self._mode == "pi":
            rgb = self._cam.capture_array()
            return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        else:
            ret, frame = self._cam.read()
            if not ret:
                raise RuntimeError("Failed to capture frame")
            return frame

    def stop(self):
        if self._cam is None:
            return
        if self._mode == "pi":
            self._cam.stop()
        else:
            self._cam.release()


WAITING_BOX_COLOR = (11, 134, 184)
MATCHED_BOX_COLOR = (0, 200, 0)
UNRECOGNIZED_BOX_COLOR = (0, 0, 220)


def annotate_face_frame(
    frame: np.ndarray,
    face_location: tuple[int, int, int, int] | None,
    box_color: tuple[int, int, int],
    worker_name: str | None = None,
) -> np.ndarray:
    """Draw a face box and optional worker name on a copy of the frame."""
    annotated_frame = frame.copy()
    if face_location is None:
        return annotated_frame

    top, right, bottom, left = face_location
    cv2.rectangle(annotated_frame, (left, top), (right, bottom), box_color, 2)

    if worker_name:
        cv2.putText(
            annotated_frame,
            worker_name,
            (left, max(20, top - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

    return annotated_frame


# ─── Main Loop ─────────────────────────────────────────────────

def run(args):
    """Main kiosk loop — face recognition + web UI."""

    # Apply CLI args to config
    if args.server:
        config.SERVER_URL = args.server
    if args.kiosk_id:
        config.KIOSK_ID = args.kiosk_id

    os.makedirs(config.DATA_DIR, exist_ok=True)
    os.makedirs(config.FACES_DIR, exist_ok=True)
    os.makedirs(config.MODEL_DIR, exist_ok=True)
    database.init_db()

    # Start Flask web UI
    logger.info("Starting web UI on port %d...", config.KIOSK_PORT)
    web_app.start_server()

    # Init face recognizer
    recognizer = FaceRecognizer()
    recognizer.load_faces()
    logger.info("Loaded %d known faces", recognizer.known_count)

    # Start background sync
    sync_worker = SyncWorker(recognizer=recognizer)
    sync_worker.start()

    # Init camera
    camera = Camera(mode=args.camera)
    try:
        camera.start()
    except RuntimeError as e:
        logger.error("Camera error: %s", e)
        web_app.update_status(
            state="ERROR",
            message=f"Camera error: {e}",
            face_detected=False,
        )
        # Keep web UI running even without camera
        while True:
            time.sleep(60)

    last_clocks: dict[int, datetime] = {}
    display_until = 0.0
    frame_count = 0
    last_face_location = None
    last_box_color = WAITING_BOX_COLOR
    last_label = None

    web_app.update_status(
        state="IDLE",
        message="Step toward camera",
        known_workers=recognizer.known_count,
        face_detected=False,
    )

    logger.info("Kiosk ready — scanning for faces")

    try:
        while True:
            try:
                frame = camera.capture_bgr()
            except Exception as e:
                logger.error("Capture error: %s", e)
                time.sleep(1)
                continue

            now = time.time()
            frame_count += 1

            # Always push frame to stream immediately (keeps video smooth)
            if last_face_location:
                web_app.set_frame(annotate_face_frame(frame, last_face_location, last_box_color, last_label))
            else:
                web_app.set_frame(frame.copy())

            # Skip recognition during display hold
            if now < display_until:
                time.sleep(0.1)
                continue

            # Only run detection every 3rd frame to keep feed smooth on Pi
            if frame_count % 3 != 0:
                time.sleep(0.05)
                continue

            # Detect face and try to match (no liveness required)
            import face_recognition as fr
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            small_rgb = cv2.resize(rgb, (0, 0), fx=0.5, fy=0.5)
            face_locations = fr.face_locations(small_rgb, model="hog")

            if not face_locations:
                last_face_location = None
                last_label = None
                web_app.update_status(
                    state="IDLE",
                    message="Step toward camera",
                    worker_name=None,
                    action=None,
                    confidence=0.0,
                    liveness_confirmed=False,
                    ear=0.0,
                    face_detected=False,
                    known_workers=recognizer.known_count,
                )
                time.sleep(0.3)
                continue

            # Scale face location back to full resolution
            top, right, bottom, left = face_locations[0]
            face_location = (top * 2, right * 2, bottom * 2, left * 2)
            last_face_location = face_location

            # Get encoding for detected face
            face_encodings = fr.face_encodings(small_rgb, face_locations)
            if not face_encodings:
                last_box_color = WAITING_BOX_COLOR
                last_label = None
                time.sleep(0.3)
                continue

            candidate = face_encodings[0]

            # Match against known workers
            encodings, ids, names_list = recognizer._snapshot_known_faces()
            name = None
            confidence = 0.0

            if encodings:
                # Detect encoding dimension
                first_enc = encodings[0]
                if len(first_enc) >= 256:
                    # ArcFace/MobileFaceNet — cosine similarity
                    from recognition import cosine_similarities
                    sims = cosine_similarities(encodings, candidate)
                    if len(sims) > 0:
                        best_idx = int(np.argmax(sims))
                        confidence = float(sims[best_idx])
                        if confidence >= 0.3:  # relaxed threshold for testing
                            name = names_list[best_idx]
                else:
                    # Legacy dlib — euclidean distance
                    distances = fr.face_distance(encodings, candidate)
                    best_idx = int(np.argmin(distances))
                    best_dist = float(distances[best_idx])
                    confidence = max(0.0, 1.0 - best_dist)
                    if best_dist <= config.RECOGNITION_TOLERANCE:
                        name = names_list[best_idx]

            if name is None:
                last_box_color = UNRECOGNIZED_BOX_COLOR
                last_label = None
                web_app.update_status(
                    state="NOT_RECOGNIZED",
                    message="❌ Face not recognized",
                    worker_name=None,
                    action=None,
                    confidence=confidence,
                    liveness_confirmed=False,
                    ear=0.0,
                    face_detected=True,
                    known_workers=recognizer.known_count,
                )
                display_until = now + config.DISPLAY_TIME_SEC
                continue

            # Face matched — determine action and log
            # Get worker ID from recognizer
            last_box_color = MATCHED_BOX_COLOR
            last_label = name

            worker_id = None
            if name in names_list:
                idx = names_list.index(name)
                worker_id = ids[idx]

            if worker_id is None:
                continue

            # Check cooldown
            last = last_clocks.get(worker_id)
            if last and datetime.now() - last < timedelta(minutes=config.CLOCK_DEBOUNCE_MINUTES):
                web_app.update_status(
                    state="ALREADY_CLOCKED",
                    message=f"✅ Already scanned, {name}!",
                    worker_name=name,
                    action=None,
                    confidence=confidence,
                    liveness_confirmed=True,
                    ear=ear,
                    face_detected=True,
                    known_workers=recognizer.known_count,
                )
                display_until = now + config.DISPLAY_TIME_SEC
                recognizer.reset_liveness()
                continue

            # Determine clock action
            if config.KIOSK_TYPE == "entry":
                action = "clock_in"
            elif config.KIOSK_TYPE == "exit":
                action = "clock_out"
            else:
                last_action = database.get_last_action(worker_id)
                action = "clock_out" if last_action == "clock_in" else "clock_in"

            # Log attendance
            database.log_attendance(
                worker_id=worker_id,
                worker_name=name,
                action=action,
                liveness_confirmed=True,
                confidence=confidence,
            )
            last_clocks[worker_id] = datetime.now()

            time_str = datetime.now().strftime("%I:%M %p")
            if action == "clock_in":
                message = f"✅ Welcome, {name}! — {time_str}"
            else:
                message = f"👋 Goodbye, {name}! — {time_str}"

            web_app.update_status(
                state="CLOCKED_IN",
                message=message,
                worker_name=name,
                action=action,
                confidence=confidence,
                liveness_confirmed=True,
                ear=ear,
                face_detected=True,
                known_workers=recognizer.known_count,
            )

            logger.info("%s: %s (confidence: %.2f)", action.replace("_", " ").title(), name, confidence)
            display_until = now + config.DISPLAY_TIME_SEC
            recognizer.reset_liveness()

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        camera.stop()
        sync_worker.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FW Gatekeeper Pi Kiosk")
    parser.add_argument("--server", default=None, help="Gatekeeper server URL")
    parser.add_argument("--kiosk-id", default=None, help="Unique kiosk identifier")
    parser.add_argument("--camera", choices=["auto", "pi", "usb"], default="auto", help="Camera type")

    args = parser.parse_args()
    run(args)
