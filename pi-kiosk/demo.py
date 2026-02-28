"""Demo mode — runs face recognition with OpenCV window (no Flask, no Pi required)."""

import logging
import os
import sys
import time
from datetime import datetime, timedelta

import cv2

import config
import database
from recognition import FaceRecognizer

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("demo")

FONT = cv2.FONT_HERSHEY_SIMPLEX
GREEN = (0, 200, 0)
RED = (0, 0, 220)
GOLD = (11, 134, 184)  # BGR for #B8860B
WHITE = (255, 255, 255)
DARK = (30, 30, 30)


def main():
    os.makedirs(config.PHOTO_DIR, exist_ok=True)
    database.init_db()

    recognizer = FaceRecognizer()
    recognizer.load_faces()
    logger.info("Loaded %d known faces", recognizer.known_count)

    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        logger.error("Cannot open camera %d", config.CAMERA_INDEX)
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    last_clocks: dict[int, datetime] = {}
    display_msg = ""
    display_color = GOLD
    display_until = 0.0

    logger.info("Demo mode running — press 'q' to quit, 'r' to reload faces")

    while True:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.1)
            continue

        now = time.time()

        if now >= display_until:
            result = recognizer.recognize_face(frame)

            if result is not None:
                worker_id, name, confidence = result

                if confidence >= config.CONFIDENCE_THRESHOLD:
                    last = last_clocks.get(worker_id)
                    if last and datetime.now() - last < timedelta(minutes=config.DEBOUNCE_MINUTES):
                        display_msg = f"Already clocked, {name}!"
                        display_color = GOLD
                    else:
                        event_type = "clock_in" if config.KIOSK_TYPE == "entry" else "clock_out"
                        database.log_attendance(worker_id, name, event_type, confidence)
                        last_clocks[worker_id] = datetime.now()
                        time_str = datetime.now().strftime("%I:%M %p")
                        if event_type == "clock_in":
                            display_msg = f"Welcome, {name}! Clocked in at {time_str}"
                            display_color = GREEN
                        else:
                            display_msg = f"Bye, {name}! Clocked out at {time_str}"
                            display_color = GREEN
                else:
                    display_msg = "Not recognized"
                    display_color = RED

                display_until = now + config.DISPLAY_TIME

        # Draw UI overlay
        h, w = frame.shape[:2]

        # Status bar at bottom
        cv2.rectangle(frame, (0, h - 50), (w, h), DARK, -1)
        if display_msg and now < display_until:
            cv2.putText(frame, display_msg, (10, h - 15), FONT, 0.7, display_color, 2)
        else:
            idle = "Step up to clock in" if config.KIOSK_TYPE == "entry" else "Step up to clock out"
            cv2.putText(frame, idle, (10, h - 15), FONT, 0.7, GOLD, 2)
            display_msg = ""

        # Time in top-right
        time_str = datetime.now().strftime("%I:%M:%S %p")
        cv2.putText(frame, time_str, (w - 200, 30), FONT, 0.7, WHITE, 1)

        # Face count
        cv2.putText(frame, f"Faces: {recognizer.known_count}", (10, 30), FONT, 0.6, GOLD, 1)

        cv2.imshow("FW Attendance - Demo", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("r"):
            recognizer.reload_faces()
            logger.info("Reloaded %d faces", recognizer.known_count)

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
