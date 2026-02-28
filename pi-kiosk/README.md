# FW Attendance Kiosk

Face recognition attendance system for Raspberry Pi with camera and touchscreen.

Workers walk up → face is recognized → clocked in/out automatically.

## Hardware Requirements

- Raspberry Pi 4 or 5 (4GB+ RAM recommended)
- Camera Module 3 or USB webcam
- 7" official touchscreen (or any display)
- Internet connection (optional — works fully offline)

## Installation

### On Raspberry Pi

```bash
git clone <repo-url> && cd pi-kiosk
chmod +x setup_pi.sh
./setup_pi.sh
```

### On Laptop (for testing)

```bash
pip install -r requirements.txt
```

## Configuration

Edit `config.py`:

| Setting | Description |
|---------|-------------|
| `KIOSK_ID` | Unique ID for this kiosk device |
| `KIOSK_TYPE` | `"entry"` for clock-in, `"exit"` for clock-out |
| `KIOSK_NAME` | Display name (e.g., "Main Entry") |
| `SERVER_URL` | Central server URL (for sync) |
| `CAMERA_INDEX` | Camera device index (usually 0) |
| `RECOGNITION_TOLERANCE` | 0.0–1.0, lower = stricter matching |
| `DEBOUNCE_MINUTES` | Prevent re-clocking within N minutes |

## Enrolling Workers

```bash
# Activate venv first (Pi only)
source venv/bin/activate

# Enroll a worker (captures 3 photos from webcam)
python enroll.py "John Smith"
python enroll.py "Jane Doe"
```

Follow on-screen prompts — press SPACE to capture each photo.

## Running the Kiosk

```bash
# Full kiosk mode (Flask UI on touchscreen)
python kiosk.py
```

Then open `http://localhost:5000` on the touchscreen browser (or use Chromium in kiosk mode).

### Auto-start Chromium in kiosk mode

Add to `~/.config/autostart/kiosk.desktop`:
```ini
[Desktop Entry]
Type=Application
Name=FW Kiosk Browser
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:5000
```

## Demo Mode (Laptop)

```bash
python demo.py
```

- Uses OpenCV window instead of Flask
- Press `q` to quit
- Press `r` to reload faces

## How It Works

1. Camera captures video frames continuously
2. `face_recognition` detects and encodes faces in each frame
3. Encoding is compared against enrolled workers (128-dim vector distance)
4. If match found and not debounced → attendance logged to SQLite
5. Flask serves a fullscreen UI with MJPEG camera stream
6. Background thread syncs logs to central server (if online)

## Offline Operation

The system works **fully offline**. All data is stored in local SQLite (`attendance.db`). When the server becomes available, unsynced logs are automatically uploaded.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Camera not opening | Check `CAMERA_INDEX` in config.py. Try `0`, `1`, or `-1` |
| No face detected | Ensure good lighting, face the camera directly |
| Wrong person recognized | Lower `RECOGNITION_TOLERANCE` (e.g., 0.4). Re-enroll with better photos |
| dlib install fails | `sudo apt-get install cmake libdlib-dev libatlas-base-dev` |
| Slow recognition | Normal on Pi — uses HOG model (~1-2 sec per frame) |
| Flask port in use | Change `FLASK_PORT` in config.py |

## Files

| File | Purpose |
|------|---------|
| `kiosk.py` | Main entry point — runs everything |
| `app.py` | Flask web server for touchscreen UI |
| `recognition.py` | Face detection and recognition engine |
| `database.py` | SQLite database manager |
| `sync.py` | Background server synchronization |
| `config.py` | All configuration settings |
| `enroll.py` | CLI tool to enroll new workers |
| `demo.py` | Demo mode for laptop testing |
| `setup_pi.sh` | Raspberry Pi setup script |
