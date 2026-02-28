"""FW Attendance Kiosk — Main entry point."""

import logging
import os
import signal
import sys
import time
from datetime import datetime, timedelta

import cv2

import config
import database
from app import set_frame, start_server, update_state
from recognition import FaceRecognizer
from sync import SyncWorker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("kiosk.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("kiosk")


class AttendanceKiosk:
    """Main kiosk controller."""

    def __init__(self):
        self.recognizer = FaceRecognizer()
        self.sync_worker = SyncWorker(recognizer=self.recognizer)
        self.camera = None
        self.running = False
        self._last_clocks: dict[int, datetime] = {}  # worker_id -> last clock time
        self._display_until: float = 0  # timestamp when to clear display

    def start(self):
        """Initialize and start all components."""
        logger.info("=" * 60)
        logger.info("FW Attendance Kiosk starting")
        logger.info("Kiosk ID: %s | Type: %s | Name: %s", config.KIOSK_ID, config.KIOSK_TYPE, config.KIOSK_NAME)
        logger.info("=" * 60)

        # Create directories
        os.makedirs(config.PHOTO_DIR, exist_ok=True)

        # Initialize database
        database.init_db()

        # Load face encodings
        self.recognizer.load_faces()
        logger.info("Loaded %d known faces", self.recognizer.known_count)

        # Open camera
        self.camera = cv2.VideoCapture(config.CAMERA_INDEX)
        if not self.camera.isOpened():
            logger.error("Failed to open camera at index %d", config.CAMERA_INDEX)
            sys.exit(1)
        self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        logger.info("Camera opened (index=%d)", config.CAMERA_INDEX)

        # Start Flask server
        start_server()

        # Start sync worker
        self.sync_worker.start()

        # Update initial state
        update_state(
            "idle",
            server_online=self.sync_worker.server_online,
            known_faces=self.recognizer.known_count,
        )

        self.running = True
        logger.info("Kiosk ready — UI at http://localhost:%d", config.FLASK_PORT)

    def stop(self):
        """Graceful shutdown."""
        logger.info("Shutting down...")
        self.running = False
        self.sync_worker.stop()
        if self.camera and self.camera.isOpened():
            self.camera.release()
        logger.info("Kiosk stopped")

    def run(self):
        """Main loop: capture → recognize → log → display."""
        self.start()

        try:
            while self.running:
                ret, frame = self.camera.read()
                if not ret:
                    logger.warning("Camera read failed, retrying...")
                    time.sleep(0.5)
                    continue

                # Share frame with Flask MJPEG stream
                set_frame(frame)

                # If still showing a result, skip recognition
                if time.time() < self._display_until:
                    time.sleep(0.1)
                    continue

                # Recognize face
                result = self.recognizer.recognize_face(frame)

                if result is None:
                    # No face or no match — return to idle after display period
                    update_state(
                        "idle",
                        server_online=self.sync_worker.server_online,
                        known_faces=self.recognizer.known_count,
                    )
                    time.sleep(0.1)
                    continue

                worker_id, name, confidence = result

                if confidence < config.CONFIDENCE_THRESHOLD:
                    update_state(
                        "unknown",
                        message="Not recognized — please see your supervisor",
                        server_online=self.sync_worker.server_online,
                        known_faces=self.recognizer.known_count,
                    )
                    self._display_until = time.time() + config.DISPLAY_TIME
                    continue

                # Debounce — don't re-clock same person within N minutes
                if self._is_debounced(worker_id):
                    logger.debug("Debounced: %s (already clocked recently)", name)
                    now = datetime.now()
                    event_type = "clock_in" if config.KIOSK_TYPE == "entry" else "clock_out"
                    update_state(
                        "recognized",
                        worker_name=name,
                        event_type=event_type,
                        message=f"Already clocked {'in' if event_type == 'clock_in' else 'out'}, {name}!",
                        server_online=self.sync_worker.server_online,
                        known_faces=self.recognizer.known_count,
                    )
                    self._display_until = time.time() + config.DISPLAY_TIME
                    continue

                # Log attendance
                event_type = "clock_in" if config.KIOSK_TYPE == "entry" else "clock_out"
                database.log_attendance(worker_id, name, event_type, confidence)
                self._last_clocks[worker_id] = datetime.now()

                # Build display message
                now = datetime.now()
                time_str = now.strftime("%I:%M %p")
                if event_type == "clock_in":
                    hour = now.hour
                    greeting = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"
                    message = f"{greeting}, {name}! Clocked in at {time_str}"
                else:
                    message = f"See you tomorrow, {name}! Clocked out at {time_str}"

                update_state(
                    "recognized",
                    worker_name=name,
                    event_type=event_type,
                    message=message,
                    server_online=self.sync_worker.server_online,
                    known_faces=self.recognizer.known_count,
                )
                self._display_until = time.time() + config.DISPLAY_TIME

                time.sleep(0.1)

        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            self.stop()

    def _is_debounced(self, worker_id: int) -> bool:
        """Check if worker clocked recently."""
        last = self._last_clocks.get(worker_id)
        if last is None:
            return False
        return datetime.now() - last < timedelta(minutes=config.DEBOUNCE_MINUTES)


def main():
    kiosk = AttendanceKiosk()

    def signal_handler(sig, frame):
        kiosk.running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    kiosk.run()


if __name__ == "__main__":
    main()
