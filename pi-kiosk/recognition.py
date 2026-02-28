"""Face recognition engine for FW Attendance Kiosk."""

import logging
import threading
from typing import Optional

import cv2
import face_recognition
import numpy as np

import config
import database

logger = logging.getLogger(__name__)


class FaceRecognizer:
    """Manages face encodings and performs recognition."""

    def __init__(self):
        self._lock = threading.Lock()
        self._encodings: list[np.ndarray] = []
        self._ids: list[int] = []
        self._names: list[str] = []

    def load_faces(self):
        """Load all known face encodings from the database."""
        with self._lock:
            self._encodings, self._ids, self._names = database.get_worker_encodings()
        logger.info("Loaded %d face encodings", len(self._encodings))

    def reload_faces(self):
        """Refresh known faces from DB (called after sync)."""
        self.load_faces()

    @property
    def known_count(self) -> int:
        return len(self._encodings)

    def recognize_face(self, frame: np.ndarray) -> Optional[tuple[int, str, float]]:
        """
        Detect and recognize faces in a BGR frame.
        Returns (worker_id, name, confidence) for best match, or None.
        Confidence is 1 - distance (higher = better match).
        """
        if len(self._encodings) == 0:
            return None

        # Convert BGR to RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Downscale for speed
        small = cv2.resize(rgb, (0, 0), fx=0.5, fy=0.5)

        # Detect face locations
        face_locations = face_recognition.face_locations(small, model="hog")
        if not face_locations:
            return None

        # If multiple faces, pick the largest (closest to camera)
        if len(face_locations) > 1:
            face_locations = [self._largest_face(face_locations)]
            logger.debug("Multiple faces detected, using largest")

        # Encode detected face
        face_encodings = face_recognition.face_encodings(small, face_locations)
        if not face_encodings:
            return None

        target_encoding = face_encodings[0]

        # Compare against known faces
        with self._lock:
            if not self._encodings:
                return None
            distances = face_recognition.face_distance(self._encodings, target_encoding)

        best_idx = int(np.argmin(distances))
        best_distance = distances[best_idx]
        confidence = 1.0 - best_distance

        if best_distance <= config.RECOGNITION_TOLERANCE:
            worker_id = self._ids[best_idx]
            name = self._names[best_idx]
            logger.info("Recognized: %s (confidence=%.2f)", name, confidence)
            return worker_id, name, confidence
        else:
            logger.debug("Face detected but no match (best distance=%.2f)", best_distance)
            return None

    @staticmethod
    def _largest_face(face_locations: list[tuple]) -> tuple:
        """Return the largest face bounding box by area."""
        def area(loc):
            top, right, bottom, left = loc
            return (bottom - top) * (right - left)
        return max(face_locations, key=area)

    @staticmethod
    def encode_face(image_path: str) -> Optional[np.ndarray]:
        """Generate 128-dim face encoding from an image file."""
        try:
            image = face_recognition.load_image_file(image_path)
        except Exception:
            logger.error("Failed to load image: %s", image_path)
            return None

        encodings = face_recognition.face_encodings(image)
        if not encodings:
            logger.warning("No face found in %s", image_path)
            return None

        if len(encodings) > 1:
            logger.warning("Multiple faces in %s, using first", image_path)

        return encodings[0]

    @staticmethod
    def encode_frame(frame: np.ndarray) -> Optional[np.ndarray]:
        """Generate face encoding from a BGR frame."""
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        encodings = face_recognition.face_encodings(rgb)
        if not encodings:
            return None
        return encodings[0]
