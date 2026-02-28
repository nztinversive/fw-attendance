#!/bin/bash
# FW Attendance Kiosk Setup for Raspberry Pi
set -e

echo "=== FW Attendance Kiosk Setup ==="

# System packages
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv cmake libdlib-dev
sudo apt-get install -y libatlas-base-dev libhdf5-dev
sudo apt-get install -y libopencv-dev python3-opencv

# Camera support
sudo apt-get install -y libcamera-dev python3-libcamera python3-picamera2

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python packages
pip install --upgrade pip
pip install -r requirements.txt

# Create directories
mkdir -p faces

# Set permissions
chmod +x kiosk.py demo.py enroll.py

echo ""
echo "=== Setup complete ==="
echo "1. Edit config.py (set KIOSK_ID, KIOSK_TYPE, SERVER_URL)"
echo "2. Enroll workers: python enroll.py \"Worker Name\""
echo "3. Run kiosk: python kiosk.py"
echo ""
echo "For auto-start on boot, add to /etc/rc.local or create a systemd service:"
echo "  [Unit]"
echo "  Description=FW Attendance Kiosk"
echo "  After=network.target"
echo "  [Service]"
echo "  WorkingDirectory=$(pwd)"
echo "  ExecStart=$(pwd)/venv/bin/python kiosk.py"
echo "  Restart=always"
echo "  User=$USER"
echo "  [Install]"
echo "  WantedBy=multi-user.target"
