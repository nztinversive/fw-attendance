# FW Gatekeeper

Factory access control system for Fading West. Face recognition at entry/exit points with real-time dashboard.

**Live Dashboard:** https://fw-gatekeeper.onrender.com  
**Convex Dashboard:** https://dashboard.convex.dev/t/thiesnoah/fw-gatekeeper

## Architecture

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Pi Kiosk (x4)      │         │  Render (Cloud)          │
│                     │         │                          │
│  Camera → Face Det. │◄──WiFi──┤  FW Gatekeeper (Next.js) │
│  → Local Match      │  sync   │  ├── Dashboard           │
│  → Terminal Display  │  5min   │  ├── Enrollment          │
│  → Offline Log      │────────►│  ├── Reports             │
│                     │         │  └── API                 │
│  SQLite (local)     │         │                          │
└─────────────────────┘         │  Face Service (FastAPI)  │
                                │  └── ArcFace ONNX encode │
                                │                          │
                                │  Convex (Database)       │
                                │  └── Workers, Attendance │
                                └──────────────────────────┘
```

## Stack

| Component | Technology |
|-----------|-----------|
| Dashboard | Next.js 14 + Tailwind CSS |
| Database | Convex (cloud) |
| Face Encoding | ArcFace ONNX (512-dim embeddings) |
| Face Detection (Pi) | dlib HOG + Haar cascade |
| Liveness | dlib 68-point landmarks (blink detection) |
| Pi Kiosk | Python 3.11 + OpenCV + face_recognition |
| Hosting | Render (free tier) |

---

# Pi Kiosk Setup Guide

## What You Need (Per Kiosk)

| Item | Notes |
|------|-------|
| Raspberry Pi 3B+ or newer | Pi 4 recommended for speed |
| microSD card (16GB+) | Class 10 or better |
| Pi Camera Module v2 or USB webcam | USB webcam is easier to set up |
| Display | HDMI monitor or 7" touchscreen (optional — terminal UI works headless) |
| Power supply | 5V 3A (Pi 4) or 5V 2.5A (Pi 3B) |
| Ethernet or WiFi | WiFi for sync, works offline after initial setup |
| Case + mount | Position camera at face height (~5 ft) |

## Kiosk Plan for Fading West (4 Kiosks)

| Kiosk ID | Name | Type | Location |
|----------|------|------|----------|
| `kiosk-entry-1` | Main Entry | entry | Building A Front Door |
| `kiosk-entry-2` | Side Entry | entry | Building A Side Door |
| `kiosk-exit-1` | Main Exit | exit | Building A Rear |
| `kiosk-exit-2` | Loading Dock | exit | Building B Loading Dock |

> Adjust these to match your actual facility layout.

---

## Step 1: Flash Raspberry Pi OS

1. Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Choose **Raspberry Pi OS Lite (64-bit)** (no desktop needed)
3. Click the ⚙️ gear icon and configure:
   - **Hostname:** `fw-kiosk-1` (increment for each Pi: `fw-kiosk-2`, etc.)
   - **Enable SSH:** Yes, use password authentication
   - **Username:** `pi`
   - **Password:** pick something secure, same for all kiosks for easy management
   - **WiFi:** enter your facility's WiFi SSID + password
   - **Locale:** set your timezone
4. Flash to microSD card
5. Insert card into Pi, connect camera, power on

## Step 2: SSH Into the Pi

Wait 1-2 minutes for first boot, then:

```bash
ssh pi@fw-kiosk-1.local
```

If `.local` doesn't resolve, find the Pi's IP from your router admin page:

```bash
ssh pi@192.168.1.XXX
```

## Step 3: Run the Setup Script

For the **first kiosk** (Main Entry):

```bash
curl -sSL https://raw.githubusercontent.com/nztinversive/fw-gatekeeper/master/pi-kiosk/setup.sh -o setup.sh
sudo KIOSK_ID=kiosk-entry-1 KIOSK_NAME="Main Entry" KIOSK_TYPE=entry bash setup.sh
```

For the **second kiosk** (Side Entry):

```bash
curl -sSL https://raw.githubusercontent.com/nztinversive/fw-gatekeeper/master/pi-kiosk/setup.sh -o setup.sh
sudo KIOSK_ID=kiosk-entry-2 KIOSK_NAME="Side Entry" KIOSK_TYPE=entry bash setup.sh
```

For **exit kiosks**:

```bash
sudo KIOSK_ID=kiosk-exit-1 KIOSK_NAME="Main Exit" KIOSK_TYPE=exit bash setup.sh
sudo KIOSK_ID=kiosk-exit-2 KIOSK_NAME="Loading Dock" KIOSK_TYPE=exit bash setup.sh
```

> ⏱ Setup takes **15-25 minutes** per Pi (mostly compiling dlib). Go set up the next Pi while this one builds.

## Step 4: Verify Camera

After setup completes, test the camera:

```bash
# Pi Camera
libcamera-hello --timeout 5000

# USB Webcam
ls /dev/video*   # should show /dev/video0
```

## Step 5: Enroll Workers on the Dashboard

Before the kiosks can recognize anyone, enroll workers:

1. Go to https://fw-gatekeeper.onrender.com
2. Enter PIN: **4729**
3. Click **Enroll Face** in the sidebar
4. Enter the worker's name and department
5. Capture 3 photos (look straight at camera, good lighting)
6. The face encoding service generates a 512-dim face vector automatically
7. Repeat for all workers

> 💡 **Tip:** Enroll in a well-lit area. Have workers remove hats/sunglasses. 3 slightly different angles (straight, slight left, slight right) improves recognition.

## Step 6: Start the Kiosks

```bash
# Start the kiosk service
sudo systemctl start fw-gatekeeper-kiosk

# Check it's running
systemctl status fw-gatekeeper-kiosk

# Watch the logs
journalctl -u fw-gatekeeper-kiosk -f
```

On first start, the kiosk will:
1. Sync worker encodings from the server
2. Cache them locally in SQLite
3. Start the camera and begin face scanning
4. Show ✅ Welcome or ❌ Not Recognized on the terminal

Then **reboot** to verify auto-start works:

```bash
sudo reboot
```

## Step 7: Repeat for All 4 Kiosks

Flash → SSH → Run setup script (with unique KIOSK_ID) → Enroll workers (only once, on the web) → Start → Reboot.

---

## How It Works Day-to-Day

### For Workers
1. Walk up to the kiosk camera
2. Look at the camera for 2-3 seconds
3. Blink naturally (liveness check)
4. See ✅ Welcome message → proceed through door

### For Admins
- **Dashboard** shows who's clocked in/out/absent in real-time
- **Log** page shows all scan events with timestamps
- **Reports** page for attendance summaries
- **Workers** page to manage/deactivate employees
- **Kiosks** page to monitor kiosk health

### Offline Mode
- Kiosks work **without internet** after initial sync
- Face encodings are cached locally in SQLite
- Attendance events log to local storage
- When WiFi reconnects, pending records sync automatically (every 5 min)

---

## Troubleshooting

### Kiosk won't start
```bash
# Check service status
systemctl status fw-gatekeeper-kiosk

# View logs
journalctl -u fw-gatekeeper-kiosk -n 50

# Common fix: restart
sudo systemctl restart fw-gatekeeper-kiosk
```

### "No enrolled workers found"
- Enroll faces on the web dashboard first
- Check WiFi: `ping google.com`
- Force sync: restart the kiosk service

### Camera not detected
```bash
# Pi Camera
vcgencmd get_camera          # supported=1 detected=1
sudo raspi-config             # Interface Options → Camera → Enable

# USB Webcam
lsusb                        # should list your webcam
ls /dev/video*               # should show /dev/video0
```

### Face not recognized (false rejections)
- Re-enroll with better lighting
- Check camera angle (should be at face height)
- Lower threshold: edit `/etc/systemd/system/fw-gatekeeper-kiosk.service`, change `--threshold 0.5` to `0.4`
- Then: `sudo systemctl daemon-reload && sudo systemctl restart fw-gatekeeper-kiosk`

### Face matching wrong person (false positives)
- Raise threshold to `0.55` or `0.6`
- Re-enroll both workers with clearer photos

### Kiosk shows stale data
```bash
# Force re-sync from server
sudo systemctl restart fw-gatekeeper-kiosk
```

### Power loss recovery
- Kiosks auto-restart on boot (systemd + watchdog timer)
- SQLite WAL mode protects against corruption
- Unsynced attendance records persist and sync when WiFi returns

---

## Maintenance

### Update kiosk software
```bash
ssh pi@fw-kiosk-1.local
cd /opt/fw-gatekeeper
sudo git pull origin master
cd pi-kiosk
./venv/bin/pip install -r requirements.txt
sudo systemctl restart fw-gatekeeper-kiosk
```

### Update all 4 kiosks at once
From any machine on the same network:

```bash
for host in fw-kiosk-1 fw-kiosk-2 fw-kiosk-3 fw-kiosk-4; do
  echo "Updating $host..."
  ssh pi@$host.local "cd /opt/fw-gatekeeper && sudo git pull && sudo systemctl restart fw-gatekeeper-kiosk"
done
```

### Add a new worker
1. Dashboard → Enroll Face → capture photos
2. Kiosks pick up new encodings on next sync cycle (≤5 min)
3. Or force immediate sync: restart kiosk service

### Deactivate a worker
1. Dashboard → Workers → click worker → Deactivate
2. Worker will no longer be recognized at kiosks after next sync

### Change the admin PIN
Set the `ADMIN_PIN` environment variable on Render:
1. Go to https://dashboard.render.com → fw-gatekeeper → Environment
2. Change `ADMIN_PIN` value
3. Redeploy

---

## Configuration Reference

### Environment Variables (Render - Dashboard)

| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | `https://modest-bat-146.convex.cloud` | Convex prod URL |
| `ADMIN_PIN` | `4729` | Dashboard login PIN |
| `FACE_ENCODE_URL` | `https://fw-face-service.onrender.com/encode` | Face encoding service |

### Kiosk Setup Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KIOSK_ID` | `kiosk-1` | Unique identifier for this kiosk |
| `KIOSK_NAME` | `FW Kiosk` | Display name |
| `KIOSK_TYPE` | `entry` | `entry` or `exit` |
| `SERVER_URL` | `https://fw-gatekeeper.onrender.com` | Dashboard server URL |

### Kiosk CLI Options

```bash
python kiosk.py --server URL --kiosk-id ID --camera [auto|pi|usb] --threshold 0.5
```

| Flag | Default | Description |
|------|---------|-------------|
| `--server` | Render URL | Gatekeeper server |
| `--kiosk-id` | `kiosk-1` | Kiosk identifier |
| `--camera` | `auto` | `pi` for Pi Camera, `usb` for USB webcam |
| `--threshold` | `0.5` | Match threshold (lower = stricter) |

### Performance

| Metric | Pi 3B | Pi 4 |
|--------|-------|------|
| Face detection | ~2-3s | ~0.8s |
| Face matching | <0.5s | <0.2s |
| Total scan time | ~3-4s | ~1-2s |
| Workers supported | 50+ | 200+ |

---

## Services

| Service | URL | Plan |
|---------|-----|------|
| Dashboard | https://fw-gatekeeper.onrender.com | Render Free |
| Face Service | https://fw-face-service.onrender.com | Render Free |
| Database | https://dashboard.convex.dev/t/thiesnoah/fw-gatekeeper | Convex Free |
