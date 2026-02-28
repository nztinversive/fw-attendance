# Task: Build Full FW Attendance Pi Kiosk System

## Context
This is a Raspberry Pi face recognition attendance kiosk. We have a working prototype with face detection confirmed. Now build the full system.

Existing files in this directory: config.py, database.py, recognition.py, sync.py, app.py, kiosk.py, demo.py, enroll.py, setup_pi.sh, templates/index.html, quick_test.py, requirements.txt

Tech: Python 3.11, face_recognition (dlib), OpenCV, Flask, SQLite

## What to Build

### 1. Liveness Detection: Blink Detection (`liveness.py`)
Anti-spoofing so people can't use a photo to clock in.

- Use dlib's 68-point facial landmark predictor
- Track Eye Aspect Ratio (EAR) — when EAR drops below threshold (~0.21) for 1-2 frames then returns, that's a blink
- EAR formula: EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||) using the 6 eye landmark points
- Require at least 1 blink detected within a 5-second window before accepting a clock-in
- Download shape_predictor_68_face_landmarks.dat if not present (from dlib's model URL or bundle it)
- Export a `LivenessChecker` class with methods:
  - `update(frame, face_location) -> bool` — feed frames, returns True when liveness confirmed
  - `reset()` — reset state for new detection attempt
  - `is_alive() -> bool` — check current liveness state
  - `get_ear() -> float` — current EAR value for debug display

### 2. Update Recognition Engine (`recognition.py`)
- Integrate LivenessChecker — don't return a match until liveness is confirmed
- Add `recognize_with_liveness(frame, known_encodings)` method that:
  1. Detects face
  2. Feeds frame to liveness checker
  3. Only matches identity after blink detected
  4. Returns: `(worker_name, confidence, liveness_confirmed)`

### 3. Enrollment System (`enroll.py` — rewrite)
Full CLI enrollment tool:
- `py enroll.py add "Worker Name"` — starts camera, shows preview
- Display face bounding box + instructions ("Look at camera, blink naturally")
- Capture 3 photos with confirmed liveness (blink detected each time)
- Average the 3 face encodings for robust matching
- Save to SQLite: worker name, encoding blob, enrollment timestamp, photo paths
- `py enroll.py list` — show all enrolled workers
- `py enroll.py remove "Worker Name"` — remove a worker
- Save enrollment photos to `data/faces/{worker_name}/` directory

### 4. Main Kiosk Application (`kiosk.py` — rewrite)
The main entry point that runs on the Pi:
- Continuous camera capture loop
- Face detection → liveness check (blink) → identity match → clock in/out
- 5-minute debounce per worker (no duplicate clocks)
- Auto clock-out after configurable hours (default 12h)
- States: IDLE → FACE_DETECTED → WAITING_FOR_BLINK → MATCHED → CLOCKED_IN
- Log all events to SQLite attendance_log table
- Run Flask server in background thread for the web UI

### 5. Web UI (`app.py` + `templates/index.html` — rewrite)
Browser-based kiosk display (like the quick_test.py but full featured):
- MJPEG live camera feed with face detection boxes
- Status display: "Step toward camera" → "Blink to verify" → "Welcome, [Name]!" → "Clocked in at [time]"
- Gold (#B8860B) accent, dark theme, large text readable from 3 feet away
- Show current time, date
- Bottom bar: today's attendance log (who clocked in/out and when)
- Admin mode (button/key): view all workers, enrollment stats
- Endpoint: GET / (main UI), GET /feed (MJPEG stream), GET /status (JSON), GET /log (today's log), POST /manual-clock (fallback)

### 6. Configuration (`config.py` — update)
Add these settings:
- LIVENESS_EAR_THRESHOLD = 0.21
- LIVENESS_BLINK_FRAMES = 2
- LIVENESS_TIMEOUT_SEC = 5
- RECOGNITION_TOLERANCE = 0.5
- CLOCK_DEBOUNCE_MINUTES = 5
- AUTO_CLOCKOUT_HOURS = 12
- KIOSK_PORT = 5555
- DATA_DIR = "data"

### 7. Database (`database.py` — update)
Ensure tables:
- workers: id, name, encoding_blob, enrolled_at, photo_count
- attendance_log: id, worker_id, worker_name, action (clock_in/clock_out), timestamp, liveness_confirmed, confidence
- sync_state: last_sync timestamp

### 8. Requirements (`requirements.txt` — update)
```
face_recognition
opencv-python
flask
numpy
scipy
dlib
```
(scipy needed for EAR distance calculations)

## Important Notes
- Must work FULLY OFFLINE — no internet required for detection/recognition
- All face data stored locally in SQLite + files
- Use the browser-based UI approach (MJPEG streaming) — NOT cv2.imshow (doesn't work on all systems)
- The shape_predictor_68_face_landmarks.dat model file: check if it exists, if not, provide instructions to download it (don't auto-download since this is offline-first)
- Keep Flask server lightweight — Pi has limited resources
- Test everything works by updating quick_test.py to use the new liveness system
