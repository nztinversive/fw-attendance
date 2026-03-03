# FW Attendance — Pi Kiosk Setup

Turn a Raspberry Pi 3 Model B into a dedicated attendance kiosk.

## What You Need

- Raspberry Pi 3 Model B (or any Pi with WiFi)
- microSD card (16GB+) with [Raspberry Pi OS Lite](https://www.raspberrypi.com/software/)
- 7" touchscreen or HDMI display
- USB power supply (5V 2.5A minimum)
- WiFi connection

## Quick Setup

1. **Flash Raspberry Pi OS Lite** (64-bit recommended) to your SD card using [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
   - In imager settings: enable SSH, set WiFi credentials, set hostname to `fw-kiosk`

2. **Boot the Pi**, SSH in:
   ```bash
   ssh pi@fw-kiosk.local
   ```

3. **Run the setup script:**
   ```bash
   sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/nztinversive/fw-attendance/master/pi-kiosk/setup.sh)"
   ```

4. **Reboot:**
   ```bash
   sudo reboot
   ```

The Pi will boot directly into fullscreen Chromium showing the attendance app.

## Configuration

### Change the URL
Edit `~/kiosk-chromium.sh` and update the URL at the bottom.

### Screen Rotation
Run setup with rotation:
```bash
ROTATE=left sudo ./setup.sh    # 90° counterclockwise
ROTATE=right sudo ./setup.sh   # 90° clockwise
ROTATE=inverted sudo ./setup.sh # 180°
```

### Custom URL
```bash
KIOSK_URL=https://your-custom-url.com sudo ./setup.sh
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Black screen after boot | SSH in, check `~/kiosk.sh` is executable |
| Chromium crashes | Pi 3B has 1GB RAM — close any other processes |
| Touchscreen not responding | Check ribbon cable (official 7" display) or USB touch cable |
| WiFi drops | Add `wifi_country=US` to `/boot/config.txt` |
| Screen stays on forever | That's by design — disable with `xset +dpms` in kiosk.sh |

## Exit Kiosk Mode

SSH into the Pi and run:
```bash
sudo systemctl stop getty@tty1
```

Or to permanently disable:
```bash
sudo rm /etc/systemd/system/getty@tty1.service.d/autologin.conf
sudo reboot
```

## Phase 2: Face Recognition

The Pi 3B works as a thin client — capture photos locally, send to `fw-attendance.onrender.com/api/face-match` for server-side matching. See `/api/face-match` route (not yet built) for the server endpoint spec.
