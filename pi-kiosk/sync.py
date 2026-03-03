"""Server synchronization for FW Gatekeeper Kiosk."""

import json
import logging
import os
import threading
import time
from datetime import datetime
from typing import Optional

import numpy as np
import requests

import config
import database

logger = logging.getLogger(__name__)


def check_server() -> bool:
    """Check if the central server is reachable."""
    try:
        r = requests.get(f"{config.SERVER_URL}/api/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


def sync_attendance() -> bool:
    """POST unsynced gatekeeper logs to server. Returns True on success."""
    logs = database.get_unsynced_logs()
    if not logs:
        return True

    try:
        r = requests.post(
            f"{config.SERVER_URL}/api/attendance/bulk",
            json={"kiosk_id": config.KIOSK_ID, "logs": logs},
            timeout=15,
        )
        if r.status_code == 200:
            log_ids = [log["id"] for log in logs]
            database.mark_synced(log_ids)
            logger.info("Synced %d gatekeeper logs to server", len(logs))
            return True
        else:
            logger.warning("Server returned %d during gatekeeper sync", r.status_code)
            return False
    except requests.RequestException as e:
        logger.warning("gatekeeper sync failed: %s", e)
        return False


def sync_workers() -> bool:
    """Download new/updated workers from server. Returns True on success."""
    last_sync = database.get_sync_state("last_worker_sync") or "2000-01-01T00:00:00"

    try:
        r = requests.get(
            f"{config.SERVER_URL}/api/sync",
            params={"kiosk_id": config.KIOSK_ID, "since": last_sync},
            timeout=15,
        )
        if r.status_code != 200:
            logger.warning("Server returned %d during worker sync", r.status_code)
            return False

        data = r.json()
        workers = data.get("workers", [])

        for w in workers:
            name = w.get("name")
            encoding_data = w.get("face_encoding")
            photo_url = w.get("photo_url")

            if not name or not encoding_data:
                continue

            encoding = np.array(encoding_data, dtype=np.float64)

            # Download photo if provided
            photo_path = None
            if photo_url:
                photo_path = _download_photo(name, photo_url)

            database.add_worker(name, encoding, photo_path)
            logger.info("Synced worker: %s", name)

        database.set_sync_state("last_worker_sync", datetime.now().isoformat())
        logger.info("Worker sync complete: %d workers", len(workers))
        return True

    except requests.RequestException as e:
        logger.warning("Worker sync failed: %s", e)
        return False
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.error("Invalid sync response: %s", e)
        return False


def _download_photo(name: str, url: str) -> Optional[str]:
    """Download a worker photo and save locally."""
    try:
        os.makedirs(config.PHOTO_DIR, exist_ok=True)
        safe_name = "".join(c if c.isalnum() or c in " -_" else "" for c in name).strip().replace(" ", "_")
        path = os.path.join(config.PHOTO_DIR, f"{safe_name}.jpg")
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            with open(path, "wb") as f:
                f.write(r.content)
            return path
    except Exception as e:
        logger.warning("Failed to download photo for %s: %s", name, e)
    return None


class SyncWorker:
    """Background thread that periodically syncs with the server."""

    def __init__(self, recognizer=None):
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._recognizer = recognizer
        self.server_online = False

    def start(self):
        """Start the sync background thread."""
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="sync-worker")
        self._thread.start()
        logger.info("Sync worker started (interval=%ds)", config.SYNC_INTERVAL)

    def stop(self):
        """Stop the sync background thread."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Sync worker stopped")

    def _run(self):
        """Main sync loop."""
        while self._running:
            try:
                self.server_online = check_server()
                if self.server_online:
                    sync_attendance()
                    if sync_workers():
                        if self._recognizer:
                            self._recognizer.reload_faces()
                else:
                    logger.debug("Server offline, skipping sync")
            except Exception as e:
                logger.error("Sync error: %s", e)

            # Sleep in small increments so we can stop quickly
            for _ in range(config.SYNC_INTERVAL):
                if not self._running:
                    break
                time.sleep(1)
