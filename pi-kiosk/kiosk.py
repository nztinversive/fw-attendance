"""Main runtime loop for FW Attendance kiosk."""

from __future__ import annotations

import logging
import signal
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2

import config
import database
from app import set_frame, start_server, update_status
from recognition import FaceRecognizer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("kiosk")


class AttendanceKiosk:
    """Kiosk state machine: IDLE -> FACE_DETECTED -> WAITING_FOR_BLINK -> MATCHED -> CLOCKED_IN."""

    def __init__(self):
        self.recognizer = FaceRecognizer()
        self.camera: Optional[cv2.VideoCapture] = None
        self.running = False
        self.state = "IDLE"
        self._hold_state_until = 0.0
        self._last_auto_clockout_check = 0.0
        self._last_no_face_reset = 0.0

    def _ensure_paths(self):
        Path(config.DATA_DIR).mkdir(parents=True, exist_ok=True)
        Path(config.FACES_DIR).mkdir(parents=True, exist_ok=True)
        Path(config.MODEL_DIR).mkdir(parents=True, exist_ok=True)

    def _set_state(
        self,
        state: str,
        message: str,
        worker_name: Optional[str] = None,
        action: Optional[str] = None,
        confidence: float = 0.0,
        liveness_confirmed: bool = False,
        face_detected: bool = False,
    ):
        self.state = state
        update_status(
            state=state,
            message=message,
            worker_name=worker_name,
            action=action,
            confidence=round(float(confidence), 3),
            liveness_confirmed=bool(liveness_confirmed),
            ear=round(float(self.recognizer.current_ear), 3),
            face_detected=face_detected,
            face_count=1 if face_detected else 0,
            known_workers=self.recognizer.known_count,
        )

    def start(self):
        self._ensure_paths()
        database.init_db()
        self.recognizer.load_faces()

        self.camera = cv2.VideoCapture(config.CAMERA_INDEX)
        if not self.camera.isOpened():
            raise RuntimeError(f"Unable to open camera index {config.CAMERA_INDEX}")
        self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
        self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)

        start_server()
        self.running = True

        if not self.recognizer.liveness_enabled:
            self._set_state(
                "WAITING_FOR_BLINK",
                "Missing shape predictor model. Install data/models/shape_predictor_68_face_landmarks.dat",
            )
        else:
            self._set_state("IDLE", "Step toward camera")

        logger.info("Kiosk started on http://localhost:%d", config.KIOSK_PORT)

    def stop(self):
        self.running = False
        if self.camera and self.camera.isOpened():
            self.camera.release()
        logger.info("Kiosk stopped")

    def _action_for_worker(self, worker_id: int) -> str:
        if config.KIOSK_TYPE == "entry":
            return "clock_in"
        if config.KIOSK_TYPE == "exit":
            return "clock_out"
        last = database.get_last_action(worker_id)
        return "clock_out" if last == "clock_in" else "clock_in"

    def _auto_clockout_if_due(self):
        now = time.monotonic()
        if now - self._last_auto_clockout_check < 30:
            return
        self._last_auto_clockout_check = now
        inserted = database.auto_clockout_overdue(config.AUTO_CLOCKOUT_HOURS)
        if inserted:
            logger.info("Auto clock-out inserted %d entries", len(inserted))

    def _draw_overlay(
        self,
        frame,
        face_location: Optional[tuple[int, int, int, int]],
        state_text: str,
        message: str,
        liveness_confirmed: bool,
    ):
        output = frame.copy()
        if face_location is not None:
            top, right, bottom, left = face_location
            color = (0, 180, 255) if liveness_confirmed else (0, 120, 255)
            cv2.rectangle(output, (left, top), (right, bottom), color, 2)

        cv2.rectangle(output, (0, 0), (output.shape[1], 92), (12, 12, 12), -1)
        cv2.putText(output, f"State: {state_text}", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (184, 134, 11), 2)
        cv2.putText(output, f"EAR: {self.recognizer.current_ear:.2f}", (12, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (220, 220, 220), 2)
        cv2.putText(output, message[:75], (12, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (220, 220, 220), 2)
        return output

    def _handle_match(self, worker_name: str, confidence: float) -> tuple[bool, str, str]:
        worker = database.get_worker_by_name(worker_name)
        if worker is None:
            return False, "clock_in", "Face matched but worker record is missing."

        worker_id = worker["id"]
        if database.was_recently_clocked(worker_id, config.CLOCK_DEBOUNCE_MINUTES):
            return False, self._action_for_worker(worker_id), f"{worker_name} already clocked recently."

        action = self._action_for_worker(worker_id)
        database.log_attendance(
            worker_id=worker_id,
            worker_name=worker_name,
            action=action,
            liveness_confirmed=True,
            confidence=confidence,
        )
        at_time = datetime.now().strftime("%I:%M %p")
        message = f"Clocked {'in' if action == 'clock_in' else 'out'} at {at_time}"
        return True, action, message

    def run(self):
        self.start()
        try:
            while self.running:
                ret, frame = self.camera.read()
                if not ret:
                    time.sleep(0.1)
                    continue

                self._auto_clockout_if_due()

                name, confidence, liveness_confirmed = self.recognizer.recognize_with_liveness(frame)
                face_detected = self.recognizer.last_face_detected
                face_location = self.recognizer.last_face_location

                message = "Step toward camera"
                action = None

                if not face_detected:
                    now = time.monotonic()
                    if now - self._last_no_face_reset > 0.8:
                        self.recognizer.reset_liveness()
                        self._last_no_face_reset = now
                    if time.monotonic() > self._hold_state_until:
                        self._set_state("IDLE", "Step toward camera", face_detected=False)
                    display = self._draw_overlay(frame, None, self.state, message, False)
                    set_frame(display)
                    time.sleep(0.03)
                    continue

                if time.monotonic() < self._hold_state_until:
                    display = self._draw_overlay(frame, face_location, self.state, _status_message(self.state), False)
                    set_frame(display)
                    time.sleep(0.03)
                    continue

                if self.state == "IDLE":
                    self._set_state("FACE_DETECTED", "Face detected", face_detected=True)

                if not liveness_confirmed:
                    self._set_state(
                        "WAITING_FOR_BLINK",
                        "Blink to verify",
                        liveness_confirmed=False,
                        face_detected=True,
                    )
                    message = "Blink to verify"
                else:
                    if name:
                        self._set_state(
                            "MATCHED",
                            f"Welcome, {name}!",
                            worker_name=name,
                            confidence=confidence,
                            liveness_confirmed=True,
                            face_detected=True,
                        )
                        ok, action, event_message = self._handle_match(name, confidence)
                        if ok:
                            self._set_state(
                                "CLOCKED_IN",
                                f"Welcome, {name}! {event_message}",
                                worker_name=name,
                                action=action,
                                confidence=confidence,
                                liveness_confirmed=True,
                                face_detected=True,
                            )
                        else:
                            self._set_state(
                                "MATCHED",
                                event_message,
                                worker_name=name,
                                action=action,
                                confidence=confidence,
                                liveness_confirmed=True,
                                face_detected=True,
                            )
                        self._hold_state_until = time.monotonic() + config.DISPLAY_TIME_SEC
                        self.recognizer.reset_liveness()
                        message = event_message
                    else:
                        self._set_state(
                            "WAITING_FOR_BLINK",
                            "Live face detected, but not recognized.",
                            liveness_confirmed=True,
                            confidence=confidence,
                            face_detected=True,
                        )
                        self._hold_state_until = time.monotonic() + 1.2
                        self.recognizer.reset_liveness()
                        message = "Live face detected, but not recognized."

                display = self._draw_overlay(frame, face_location, self.state, message, liveness_confirmed)
                set_frame(display)
                time.sleep(0.03)

        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            self.stop()


def _status_message(state: str) -> str:
    if state == "WAITING_FOR_BLINK":
        return "Blink to verify"
    if state == "FACE_DETECTED":
        return "Face detected"
    if state == "MATCHED":
        return "Face matched"
    if state == "CLOCKED_IN":
        return "Attendance recorded"
    return "Step toward camera"


def main():
    kiosk = AttendanceKiosk()

    def _handle_signal(_sig, _frame):
        kiosk.running = False

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)
    kiosk.run()


if __name__ == "__main__":
    main()
