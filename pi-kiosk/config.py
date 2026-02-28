"""Configuration for FW Attendance Kiosk."""

# Server
SERVER_URL = "https://fw-attendance.onrender.com"
KIOSK_ID = "kiosk-entry-1"
KIOSK_TYPE = "entry"  # "entry" or "exit"
KIOSK_NAME = "Main Entry"

# Camera
CAMERA_INDEX = 0

# Recognition
RECOGNITION_TOLERANCE = 0.5  # Lower = stricter match
CONFIDENCE_THRESHOLD = 0.5

# Sync
SYNC_INTERVAL = 30  # seconds

# Storage
DB_PATH = "attendance.db"
PHOTO_DIR = "faces/"

# Display
DISPLAY_TIME = 3  # seconds to show result
DEBOUNCE_MINUTES = 5  # don't re-clock same person within this window

# Flask
FLASK_HOST = "0.0.0.0"
FLASK_PORT = 5000
