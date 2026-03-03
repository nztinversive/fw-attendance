"""Configuration for FW Gatekeeper Pi kiosk."""

from pathlib import Path

# Server (optional if running fully offline)
SERVER_URL = "https://fw-gatekeeper.onrender.com"
SYNC_INTERVAL = 30  # seconds

# Kiosk identity
KIOSK_ID = "kiosk-entry-1"
KIOSK_TYPE = "entry"  # entry | exit | auto
KIOSK_NAME = "Main Entry"

# Camera
CAMERA_INDEX = 0
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480

# Liveness / recognition
LIVENESS_EAR_THRESHOLD = 0.21
LIVENESS_BLINK_FRAMES = 2
LIVENESS_TIMEOUT_SEC = 5
RECOGNITION_TOLERANCE = 0.5

# Gatekeeper behavior
CLOCK_DEBOUNCE_MINUTES = 5
AUTO_CLOCKOUT_HOURS = 12
DISPLAY_TIME_SEC = 3

# Web server
FLASK_HOST = "0.0.0.0"
KIOSK_PORT = 5555
FLASK_PORT = KIOSK_PORT  # backward-compatible alias

# Storage
DATA_DIR = "data"
_DATA_PATH = Path(DATA_DIR)
DB_PATH = str(_DATA_PATH / "attendance.db")
FACES_DIR = str(_DATA_PATH / "faces")
MODEL_DIR = str(_DATA_PATH / "models")
SHAPE_PREDICTOR_PATH = str(Path(MODEL_DIR) / "shape_predictor_68_face_landmarks.dat")

# Backward-compatible alias used by legacy modules
PHOTO_DIR = FACES_DIR
