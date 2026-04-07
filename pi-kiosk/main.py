#!/usr/bin/env python3
"""
FW Gatekeeper - Pi Kiosk Main Entry Point
Camera feed on main thread. Face detection on background thread.
"""

import argparse
import logging
import os
import time
import threading
from datetime import datetime, timedelta

import cv2
import numpy as np
import face_recognition as fr

import config
import database
from recognition import FaceRecognizer, cosine_similarities
from sync import SyncWorker
import app as web_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")


class Camera:
    def __init__(self, mode="auto"):
        self._cam = None
        self._mode = mode

    def start(self):
        if self._mode in ("pi", "auto"):
            try:
                from picamera2 import Picamera2
                self._cam = Picamera2()
                cam_config = self._cam.create_video_configuration(
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

    def capture_bgr(self):
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


GOLD = (11, 134, 184)
GREEN = (0, 200, 0)
RED = (0, 0, 220)


def draw_box(frame, face_loc, color, label=None):
    out = frame.copy()
    if face_loc is None:
        return out
    top, right, bottom, left = face_loc
    cv2.rectangle(out, (left, top), (right, bottom), color, 2)
    if label:
        cv2.putText(out, label, (left, max(20, top - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
    return out


def run(args):
    if args.server:
        config.SERVER_URL = args.server
    if args.kiosk_id:
        config.KIOSK_ID = args.kiosk_id

    os.makedirs(config.DATA_DIR, exist_ok=True)
    os.makedirs(config.FACES_DIR, exist_ok=True)
    os.makedirs(config.MODEL_DIR, exist_ok=True)
    database.init_db()

    logger.info("Starting web UI on port %d...", config.KIOSK_PORT)
    web_app.start_server()

    recognizer = FaceRecognizer()
    recognizer.load_faces()
    logger.info("Loaded %d known faces", recognizer.known_count)

    sync_worker = SyncWorker(recognizer=recognizer)
    sync_worker.start()

    camera = Camera(mode=args.camera)
    try:
        camera.start()
    except RuntimeError as e:
        logger.error("Camera error: %s", e)
        web_app.update_status(state="ERROR", message=f"Camera error: {e}", face_detected=False)
        while True:
            time.sleep(60)

    # Shared state
    detect_lock = threading.Lock()
    pending_frame = [None]
    current_result = [None]  # (face_loc, name, confidence) or None
    detect_count = [0]

    last_clocks = {}
    display_until = [0.0]

    # Overlay state
    box_loc = None
    box_color = GOLD
    box_label = None

    def detection_loop():
        """Background: detect faces + match against known workers."""
        logger.info("Detection thread started")
        while True:
            # Grab frame
            with detect_lock:
                frame = pending_frame[0]
                pending_frame[0] = None

            if frame is None:
                time.sleep(0.1)
                continue

            try:
                h, w = frame.shape[:2]
                logger.debug("Processing frame %dx%d", w, h)

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                small = cv2.resize(rgb, (0, 0), fx=0.5, fy=0.5)
                locs = fr.face_locations(small, model="hog")

                detect_count[0] += 1
                if detect_count[0] % 10 == 1:
                    logger.info("Detection #%d: frame %s dtype=%s, found %d faces", detect_count[0], frame.shape, frame.dtype, len(locs))

                if not locs:
                    current_result[0] = None
                    continue

                top, right, bottom, left = locs[0]
                face_loc = (top * 2, right * 2, bottom * 2, left * 2)

                encs = fr.face_encodings(small, locs)
                if not encs:
                    current_result[0] = (face_loc, None, 0.0)
                    continue

                candidate = encs[0]
                known_encs, known_ids, known_names = recognizer._snapshot_known_faces()
                matched = None
                conf = 0.0

                if known_encs:
                    if len(known_encs[0]) >= 256:
                        sims = cosine_similarities(known_encs, candidate)
                        if len(sims) > 0:
                            best = int(np.argmax(sims))
                            conf = float(sims[best])
                            logger.info("Cosine sim: %.3f (name: %s)", conf, known_names[best])
                            if conf >= 0.3:
                                matched = known_names[best]
                    else:
                        dists = fr.face_distance(known_encs, candidate)
                        best = int(np.argmin(dists))
                        conf = max(0.0, 1.0 - float(dists[best]))
                        if dists[best] <= config.RECOGNITION_TOLERANCE:
                            matched = known_names[best]

                current_result[0] = (face_loc, matched, conf)

            except Exception as e:
                logger.error("Detection error: %s", e, exc_info=True)
                current_result[0] = None

    det_thread = threading.Thread(target=detection_loop, daemon=True, name="face-detect")
    det_thread.start()

    web_app.update_status(state="IDLE", message="Step toward camera",
                          known_workers=recognizer.known_count, face_detected=False)
    logger.info("Kiosk ready - main loop starting")

    try:
        while True:
            try:
                frame = camera.capture_bgr()
            except Exception as e:
                logger.error("Capture error: %s", e)
                time.sleep(1)
                continue

            now = time.time()

            # 1. Push frame to stream (always, never blocks)
            web_app.set_frame(draw_box(frame, box_loc, box_color, box_label))

            # 2. Feed frame to detection thread
            with detect_lock:
                if pending_frame[0] is None:
                    pending_frame[0] = frame.copy()

            # 3. Skip processing during display hold
            if now < display_until[0]:
                time.sleep(0.05)
                continue

            # 4. Check latest detection result
            result = current_result[0]

            if result is None:
                if box_loc is not None:
                    box_loc = None
                    box_label = None
                    web_app.update_status(state="IDLE", message="Step toward camera",
                                          face_detected=False, known_workers=recognizer.known_count)
                time.sleep(0.05)
                continue

            face_loc, name, confidence = result
            box_loc = face_loc

            if name is None:
                box_color = RED
                box_label = None
                web_app.update_status(state="NOT_RECOGNIZED", message="Face not recognized",
                                      face_detected=True, confidence=confidence,
                                      known_workers=recognizer.known_count)
                display_until[0] = now + config.DISPLAY_TIME_SEC
                continue

            # Matched!
            box_color = GREEN
            box_label = name

            _, known_ids, known_names = recognizer._snapshot_known_faces()
            worker_id = None
            if name in known_names:
                idx = known_names.index(name)
                worker_id = known_ids[idx]

            if worker_id is None:
                continue

            last = last_clocks.get(worker_id)
            if last and datetime.now() - last < timedelta(minutes=config.CLOCK_DEBOUNCE_MINUTES):
                web_app.update_status(state="ALREADY_CLOCKED",
                                      message=f"Already scanned, {name}!",
                                      worker_name=name, face_detected=True,
                                      confidence=confidence,
                                      known_workers=recognizer.known_count)
                display_until[0] = now + config.DISPLAY_TIME_SEC
                continue

            if config.KIOSK_TYPE == "entry":
                action = "clock_in"
            elif config.KIOSK_TYPE == "exit":
                action = "clock_out"
            else:
                last_action = database.get_last_action(worker_id)
                action = "clock_out" if last_action == "clock_in" else "clock_in"

            database.log_attendance(
                worker_id=worker_id, worker_name=name,
                action=action, liveness_confirmed=False, confidence=confidence,
            )
            last_clocks[worker_id] = datetime.now()

            time_str = datetime.now().strftime("%I:%M %p")
            msg = f"Welcome, {name}! - {time_str}" if action == "clock_in" else f"Goodbye, {name}! - {time_str}"

            web_app.update_status(state="CLOCKED_IN", message=msg,
                                  worker_name=name, action=action,
                                  confidence=confidence, face_detected=True,
                                  known_workers=recognizer.known_count)
            logger.info("%s: %s (confidence: %.2f)", action.replace("_", " ").title(), name, confidence)
            display_until[0] = now + config.DISPLAY_TIME_SEC

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        camera.stop()
        sync_worker.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FW Gatekeeper Pi Kiosk")
    parser.add_argument("--server", default=None)
    parser.add_argument("--kiosk-id", default=None)
    parser.add_argument("--camera", choices=["auto", "pi", "usb"], default="auto")
    run(parser.parse_args())
