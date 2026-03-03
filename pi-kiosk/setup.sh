#!/bin/bash
# ─────────────────────────────────────────────────────
# FW Attendance — Pi Kiosk Setup Script
# Target: Raspberry Pi 3 Model B (Raspbian/Raspberry Pi OS Lite)
#
# What this does:
#   1. Updates system packages
#   2. Installs minimal X server + Chromium
#   3. Configures auto-login + auto-start kiosk
#   4. Hides cursor, disables screen blanking
#   5. Points Chromium at FW Attendance URL
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/nztinversive/fw-attendance/master/pi-kiosk/setup.sh | bash
#   — or —
#   chmod +x setup.sh && sudo ./setup.sh
#
# Requires: Raspberry Pi OS Lite (64-bit or 32-bit)
# ─────────────────────────────────────────────────────

set -euo pipefail

# ─── Configuration ──────────────────────────────────
KIOSK_URL="${KIOSK_URL:-https://fw-attendance.onrender.com}"
KIOSK_USER="pi"
ROTATE="${ROTATE:-normal}"  # normal, left, right, inverted

echo "╔═══════════════════════════════════════════╗"
echo "║   FW Attendance — Pi Kiosk Setup          ║"
echo "║   Target URL: $KIOSK_URL"
echo "╚═══════════════════════════════════════════╝"

# ─── Must run as root ───────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: Run with sudo or as root."
  exit 1
fi

# ─── System Update ──────────────────────────────────
echo "[1/6] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ─── Install Dependencies ──────────────────────────
echo "[2/6] Installing X server, Chromium, and utilities..."
apt-get install -y -qq \
  xserver-xorg x11-xserver-utils xinit \
  chromium-browser \
  unclutter \
  sed

# ─── Auto-login on tty1 ────────────────────────────
echo "[3/6] Configuring auto-login..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
EOF

# ─── Kiosk launch script ───────────────────────────
echo "[4/6] Creating kiosk launch script..."
KIOSK_SCRIPT="/home/$KIOSK_USER/kiosk.sh"
cat > "$KIOSK_SCRIPT" << 'KIOSKEOF'
#!/bin/bash
# FW Attendance Kiosk — auto-started by .bash_profile

export DISPLAY=:0

# Start X server
xinit /home/pi/kiosk-chromium.sh -- :0 vt1 &
sleep 2

# Hide cursor after 0.5s idle
unclutter -idle 0.5 -root &

# Disable screen blanking / power management
xset s off
xset -dpms
xset s noblank
KIOSKEOF

cat > "/home/$KIOSK_USER/kiosk-chromium.sh" << EOF
#!/bin/bash
# Screen rotation (if needed)
xrandr --output HDMI-1 --rotate $ROTATE 2>/dev/null || true
xrandr --output DSI-1 --rotate $ROTATE 2>/dev/null || true

# Launch Chromium in kiosk mode
chromium-browser \\
  --noerrdialogs \\
  --disable-infobars \\
  --kiosk \\
  --incognito \\
  --disable-translate \\
  --disable-features=TranslateUI \\
  --disable-session-crashed-bubble \\
  --disable-component-update \\
  --check-for-update-interval=31536000 \\
  --autoplay-policy=no-user-gesture-required \\
  --no-first-run \\
  --start-fullscreen \\
  --window-size=1024,600 \\
  --window-position=0,0 \\
  "$KIOSK_URL"
EOF

chmod +x "$KIOSK_SCRIPT"
chmod +x "/home/$KIOSK_USER/kiosk-chromium.sh"
chown "$KIOSK_USER:$KIOSK_USER" "$KIOSK_SCRIPT" "/home/$KIOSK_USER/kiosk-chromium.sh"

# ─── Auto-start on login ───────────────────────────
echo "[5/6] Configuring auto-start..."
PROFILE="/home/$KIOSK_USER/.bash_profile"
if ! grep -q "kiosk.sh" "$PROFILE" 2>/dev/null; then
  cat >> "$PROFILE" << 'EOF'

# Auto-start kiosk on tty1
if [ "$(tty)" = "/dev/tty1" ]; then
  exec /home/pi/kiosk.sh
fi
EOF
  chown "$KIOSK_USER:$KIOSK_USER" "$PROFILE"
fi

# ─── Disable screen blanking in boot config ────────
echo "[6/6] Disabling screen blanking in boot config..."
CMDLINE="/boot/cmdline.txt"
if [ -f "$CMDLINE" ] && ! grep -q "consoleblank=0" "$CMDLINE"; then
  sed -i 's/$/ consoleblank=0/' "$CMDLINE"
fi

# ─── GPU memory split (give more to GPU for Chromium) ─
CONFIG="/boot/config.txt"
if [ -f "$CONFIG" ] && ! grep -q "gpu_mem=" "$CONFIG"; then
  echo "gpu_mem=128" >> "$CONFIG"
fi

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   ✅ Kiosk setup complete!                ║"
echo "║                                           ║"
echo "║   URL: $KIOSK_URL"
echo "║   Reboot to start: sudo reboot            ║"
echo "║                                           ║"
echo "║   To change URL later:                    ║"
echo "║   Edit ~/kiosk-chromium.sh                ║"
echo "║                                           ║"
echo "║   To exit kiosk mode:                     ║"
echo "║   SSH in, then: sudo systemctl stop       ║"
echo "║   getty@tty1                               ║"
echo "╚═══════════════════════════════════════════╝"
