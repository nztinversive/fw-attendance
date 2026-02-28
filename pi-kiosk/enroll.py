"""CLI enrollment tool — capture face from webcam and save to local DB."""

import logging
import os
import sys
import time

import cv2
import numpy as np

import config
import database
from recognition import FaceRecognizer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("enroll")

NUM_CAPTURES = 3


def main():
    if len(sys.argv) < 2:
        print("Usage: python enroll.py \"Worker Name\"")
        sys.exit(1)

    name = " ".join(sys.argv[1:]).strip()
    if not name:
        print("Error: Name cannot be empty")
        sys.exit(1)

    os.makedirs(config.PHOTO_DIR, exist_ok=True)
    database.init_db()

    cap = cv2.VideoCapture(config.CAMERA_INDEX)
    if not cap.isOpened():
        print(f"Error: Cannot open camera {config.CAMERA_INDEX}")
        sys.exit(1)

    print(f"\nEnrolling: {name}")
    print(f"Will capture {NUM_CAPTURES} photos. Look at the camera.")
    print("Press SPACE to capture, 'q' to cancel.\n")

    encodings = []
    capture_count = 0

    while capture_count < NUM_CAPTURES:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.1)
            continue

        # Show frame
        display = frame.copy()
        h, w = display.shape[:2]
        cv2.rectangle(display, (0, h - 40), (w, h), (30, 30, 30), -1)
        cv2.putText(display, f"Capture {capture_count + 1}/{NUM_CAPTURES} — SPACE to capture, Q to cancel",
                    (10, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.imshow("Enrollment", display)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            print("Cancelled.")
            cap.release()
            cv2.destroyAllWindows()
            sys.exit(0)
        elif key == ord(" "):
            encoding = FaceRecognizer.encode_frame(frame)
            if encoding is None:
                print(f"  No face detected — try again")
                continue

            encodings.append(encoding)
            capture_count += 1
            print(f"  Captured {capture_count}/{NUM_CAPTURES}")

            # Save the last photo
            if capture_count == NUM_CAPTURES:
                safe_name = "".join(c if c.isalnum() or c in " -_" else "" for c in name).strip().replace(" ", "_")
                photo_path = os.path.join(config.PHOTO_DIR, f"{safe_name}.jpg")
                cv2.imwrite(photo_path, frame)

            time.sleep(0.3)  # Brief pause

    cap.release()
    cv2.destroyAllWindows()

    # Average the encodings for robustness
    avg_encoding = np.mean(encodings, axis=0)

    # Save to database
    safe_name = "".join(c if c.isalnum() or c in " -_" else "" for c in name).strip().replace(" ", "_")
    photo_path = os.path.join(config.PHOTO_DIR, f"{safe_name}.jpg")
    worker_id = database.add_worker(name, avg_encoding, photo_path)

    print(f"\n✓ Enrolled '{name}' (worker_id={worker_id})")
    print(f"  Encoding averaged from {NUM_CAPTURES} captures")
    print(f"  Photo saved: {photo_path}")


if __name__ == "__main__":
    main()
