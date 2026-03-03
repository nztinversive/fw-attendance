# FW Attendance — Pi Kiosk Face Scanner

Raspberry Pi 3B face recognition kiosk for factory building access control.

## How It Works

1. Camera captures faces continuously
2. Matches against enrolled worker face encodings (stored locally)
3. Shows ✅ Welcome or ❌ Not Recognized
4. Logs attendance locally (works **offline** — no WiFi required)
5. Syncs attendance records to server every 5 minutes when WiFi is available

## What You Need

- Raspberry Pi 3 Model B (or newer)
- Pi Camera Module v2 (or USB webcam)
- microSD card (16GB+) with [Raspberry Pi OS Lite](https://www.raspberrypi.com/software/)
- Display (HDMI or 7" touchscreen)
- USB power supply (5V 2.5A minimum)

## Setup

### 1. Flash Raspberry Pi OS

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to flash **Raspberry Pi OS Lite (64-bit)**.

In imager settings:
- Enable SSH
- Set WiFi credentials
- Set hostname to `fw-kiosk`

### 2. Boot & SSH In

```bash
ssh pi@fw-kiosk.local
```

### 3. Run Setup Script

```bash
curl -sSL https://raw.githubusercontent.com/nztinversive/fw-attendance/master/pi-kiosk/setup.sh -o setup.sh
sudo chmod +x setup.sh
sudo KIOSK_URL=https://fw-attendance.onrender.com ./setup.sh
```

### 4. Enroll Workers

On the web app (https://fw-attendance.onrender.com):
1. Go to **Enroll Face**
2. Enter worker name + department
3. Capture 3 photos from webcam
4. Photos are encoded into face vectors

### 5. Reboot the Pi

```bash
sudo reboot
```

The Pi boots directly into the face scanner. It syncs worker encodings from the server on startup, then runs face matching locally.

## Offline Mode

The kiosk works **without internet** after the initial sync:

- Worker face encodings are cached in `~/fw-kiosk/data/encodings.json`
- Attendance scans are logged to `~/fw-kiosk/data/attendance_offline.json`
- When WiFi reconnects, pending records sync to the server automatically

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KIOSK_URL` | `https://fw-attendance.onrender.com` | Server URL |
| `KIOSK_ID` | `kiosk-1` | Unique kiosk identifier |

### Command Line

```bash
python3 kiosk.py --server URL --kiosk-id ID --camera [auto|pi|usb] --threshold 0.6
```

- `--threshold`: Face match distance (0-1). Lower = stricter. Default 0.6.
- `--camera`: `pi` for Pi Camera, `usb` for USB webcam, `auto` to try both.

## Performance on Pi 3B

- Face detection: ~2-3 seconds per frame (HOG model)
- Face matching: <0.5 seconds against 50 workers
- Total scan time: ~3-4 seconds

For faster detection, use a Pi 4 (~1 second total).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No camera available" | Check `vcgencmd get_camera` (Pi) or `lsusb` (USB) |
| "No enrolled workers found" | Enroll faces on the web app first, ensure WiFi for initial sync |
| Slow face detection | Normal for Pi 3B — HOG model is CPU-only |
| False rejections | Lower threshold: `--threshold 0.7` |
| False matches | Raise threshold: `--threshold 0.5` |
| Camera permission denied | Run `sudo raspi-config` → Interface → Camera → Enable |

## Architecture

```
Pi 3B (Kiosk)                    Render (Server)
┌─────────────┐                  ┌──────────────────┐
│ Camera      │                  │ FW Attendance App │
│ ↓           │   WiFi sync     │                   │
│ face_rec    │ ←──────────────→ │ /api/workers      │
│ (local)     │   (every 5min)  │ /api/attendance   │
│ ↓           │                  │ /api/enroll       │
│ Terminal UI │                  │                   │
│ ↓           │                  │ face-service      │
│ Local Log   │                  │ (encode only)     │
└─────────────┘                  └──────────────────┘
```
