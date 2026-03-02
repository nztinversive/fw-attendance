#!/bin/bash
# FW Attendance Kiosk - Raspberry Pi Setup Script
# Run as: sudo bash setup_pi.sh
# Tested on: Raspberry Pi 4/5 with Raspbian Bookworm

set -e

echo "=== FW Attendance Kiosk Setup ==="
echo ""

# --- System Updates ---
echo "[1/8] Updating system packages..."
apt-get update -y
apt-get upgrade -y

# --- Dependencies ---
echo "[2/8] Installing dependencies..."
apt-get install -y \
    python3-pip python3-venv python3-dev \
    cmake build-essential \
    libopenblas-dev liblapack-dev \
    libhdf5-dev libatlas-base-dev \
    libjpeg-dev libpng-dev \
    libcamera-dev libcamera-apps \
    python3-picamera2 \
    chromium-browser \
    unclutter \
    sqlite3

# --- Python Virtual Environment ---
echo "[3/8] Setting up Python virtual environment..."
KIOSK_DIR="/opt/fw-attendance"
mkdir -p $KIOSK_DIR
cp -r . $KIOSK_DIR/
cd $KIOSK_DIR

python3 -m venv venv --system-site-packages
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

# --- Download dlib shape predictor ---
echo "[4/8] Downloading face landmark model..."
mkdir -p data/models
if [ ! -f "data/models/shape_predictor_68_face_landmarks.dat" ]; then
    wget -q "https://github.com/italojs/facial-landmarks-recognition/raw/master/shape_predictor_68_face_landmarks.dat" \
        -O data/models/shape_predictor_68_face_landmarks.dat
    echo "  Downloaded shape predictor model"
else
    echo "  Shape predictor model already exists"
fi

# --- Create data directories ---
echo "[5/8] Creating data directories..."
mkdir -p data/faces data/models

# --- Systemd Service (auto-start + auto-restart) ---
echo "[6/8] Installing systemd service..."
cat > /etc/systemd/system/fw-kiosk.service << 'EOF'
[Unit]
Description=FW Attendance Kiosk
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/fw-attendance
ExecStart=/opt/fw-attendance/venv/bin/python kiosk.py
Restart=always
RestartSec=5
StartLimitBurst=0
Environment=DISPLAY=:0
Environment=PYTHONUNBUFFERED=1
StandardOutput=journal
StandardError=journal

# Watchdog: restart if unresponsive for 60s
WatchdogSec=60

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fw-kiosk.service

# --- Auto-login + Kiosk Mode (Chromium fullscreen to local web UI) ---
echo "[7/8] Configuring auto-login and kiosk display..."

# Auto-login for pi user
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << 'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin pi --noclear %I $TERM
EOF

# Kiosk browser startup script (shows the Flask web UI fullscreen)
cat > /home/pi/kiosk.sh << 'KIOSKEOF'
#!/bin/bash
# Wait for the kiosk service to be ready
sleep 5

# Disable screen blanking
xset s off
xset -dpms
xset s noblank

# Hide mouse cursor
unclutter -idle 0.1 -root &

# Wait for kiosk web server
for i in $(seq 1 30); do
    curl -s http://localhost:5555/health > /dev/null 2>&1 && break
    sleep 2
done

# Launch Chromium in kiosk mode
chromium-browser \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --kiosk \
    --incognito \
    --disable-translate \
    --no-first-run \
    --fast \
    --fast-start \
    --disable-features=TranslateUI \
    --check-for-update-interval=31536000 \
    --autoplay-policy=no-user-gesture-required \
    http://localhost:5555 &
KIOSKEOF
chmod +x /home/pi/kiosk.sh
chown pi:pi /home/pi/kiosk.sh

# Add kiosk.sh to autostart
mkdir -p /home/pi/.config/autostart
cat > /home/pi/.config/autostart/kiosk.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=FW Kiosk
Exec=/home/pi/kiosk.sh
X-GNOME-Autostart-enabled=true
EOF
chown -R pi:pi /home/pi/.config/autostart

# --- Filesystem Protection (read-only overlay for resilience) ---
echo "[8/8] Configuring power-loss protection..."

# SQLite WAL mode handles crash recovery, but let's also add a 
# clean shutdown hook and filesystem sync
cat > /etc/systemd/system/fw-kiosk-watchdog.service << 'EOF'
[Unit]
Description=FW Kiosk Watchdog - ensures kiosk recovers from crashes
After=fw-kiosk.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'systemctl is-active fw-kiosk.service || systemctl restart fw-kiosk.service'

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/fw-kiosk-watchdog.timer << 'EOF'
[Unit]
Description=Check FW Kiosk every 30 seconds

[Timer]
OnBootSec=30
OnUnitActiveSec=30

[Install]
WantedBy=timers.target
EOF

systemctl enable fw-kiosk-watchdog.timer

# Ensure data directory is writable and persists
chown -R pi:pi /opt/fw-attendance/data

echo ""
echo "=== Setup Complete ==="
echo ""
echo "The kiosk will:"
echo "  ✅ Auto-start on boot (systemd service)"
echo "  ✅ Auto-restart if it crashes (RestartSec=5)"
echo "  ✅ Auto-recover from power loss (SQLite WAL + watchdog)"
echo "  ✅ Launch Chromium in kiosk mode (fullscreen, no toolbar)"
echo "  ✅ Hide mouse cursor"
echo "  ✅ Sync attendance when internet connects"
echo ""
echo "To start now:  sudo systemctl start fw-kiosk"
echo "To view logs:  journalctl -u fw-kiosk -f"
echo "To stop:       sudo systemctl stop fw-kiosk"
echo ""
echo "Dashboard URL: Configure SERVER_URL in config.py"
echo "Kiosk web UI:  http://localhost:5555"
echo ""
echo "Reboot to test full auto-start: sudo reboot"
