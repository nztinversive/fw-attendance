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

    payload_logs = []
    synced_log_ids = []
    missing_mappings = 0
    server_id_cache: dict[int, Optional[str]] = {}

    for log in logs:
        local_worker_id = int(log["worker_id"])
        if local_worker_id not in server_id_cache:
            server_id_cache[local_worker_id] = database.get_server_id(local_worker_id)
        server_id = server_id_cache[local_worker_id]
        if not server_id:
            missing_mappings += 1
            logger.error(
                "Skipping attendance log %s: no server_id for local worker_id=%s worker_name=%s",
                log["id"],
                local_worker_id,
                log.get("worker_name"),
            )
            continue

        payload_logs.append(
            {
                "worker_id": server_id,
                "worker_name": log.get("worker_name"),
                "event_type": log.get("event_type") or log.get("action"),
                "action": log.get("action"),
                "timestamp": log.get("timestamp"),
                "liveness_confirmed": log.get("liveness_confirmed"),
                "confidence": log.get("confidence"),
                "kiosk_id": log.get("kiosk_id") or config.KIOSK_ID,
                "note": log.get("note"),
            }
        )
        synced_log_ids.append(int(log["id"]))

    if not payload_logs:
        logger.error(
            "Attendance sync aborted: %d unsynced logs found, but none had a server_id mapping",
            len(logs),
        )
        return False

    try:
        r = requests.post(
            f"{config.SERVER_URL}/api/attendance/bulk",
            json={"kiosk_id": config.KIOSK_ID, "logs": payload_logs},
            timeout=15,
        )
        if r.status_code == 200:
            database.mark_synced(synced_log_ids)
            logger.info(
                "Synced %d gatekeeper logs to server%s",
                len(synced_log_ids),
                f"; {missing_mappings} still waiting for worker mappings" if missing_mappings else "",
            )
            return missing_mappings == 0
        else:
            logger.error(
                "Attendance sync failed with status=%d body=%s",
                r.status_code,
                r.text[:1000],
            )
            return False
    except requests.RequestException:
        logger.exception("Attendance sync request failed")
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
            server_id = w.get("id")
            name = w.get("name")
            encoding_data = w.get("face_encoding")
            photo_url = w.get("photo_url")
            enrolled_at = w.get("enrolled_at")

            if not server_id or not name or encoding_data is None:
                logger.warning("Skipping worker sync row with missing required fields: %s", w)
                continue

            encoding = np.array(encoding_data, dtype=np.float64)

            # Download photo if provided
            photo_path = None
            if photo_url:
                photo_path = _download_photo(name, photo_url)

            database.add_worker(
                name=name,
                encoding=encoding,
                photo_paths=[photo_path] if photo_path else [],
                enrolled_at=enrolled_at,
                server_id=str(server_id),
            )
            logger.info("Synced worker: %s (server_id=%s)", name, server_id)

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
                    workers_synced = sync_workers()
                    if workers_synced:
                        if self._recognizer:
                            self._recognizer.reload_faces()
                    sync_attendance()
                else:
                    logger.debug("Server offline, skipping sync")
            except Exception as e:
                logger.error("Sync error: %s", e)

            # Sleep in small increments so we can stop quickly
            for _ in range(config.SYNC_INTERVAL):
                if not self._running:
                    break
                time.sleep(1)
