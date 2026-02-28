"""SQLite database manager for FW Attendance Kiosk."""

import json
import logging
import sqlite3
import threading
from datetime import datetime
from typing import Optional

import numpy as np

import config

logger = logging.getLogger(__name__)

_local = threading.local()


def _get_conn() -> sqlite3.Connection:
    """Get a thread-local database connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(config.DB_PATH)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn


def init_db():
    """Create tables if they don't exist."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            face_encoding TEXT NOT NULL,
            photo_path TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS attendance_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id INTEGER NOT NULL,
            worker_name TEXT NOT NULL,
            event_type TEXT NOT NULL CHECK(event_type IN ('clock_in', 'clock_out')),
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            confidence REAL,
            kiosk_id TEXT NOT NULL,
            synced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        );

        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)
    conn.commit()
    logger.info("Database initialized at %s", config.DB_PATH)


def add_worker(name: str, encoding: np.ndarray, photo_path: Optional[str] = None) -> int:
    """Add a worker with their face encoding. Returns worker ID."""
    conn = _get_conn()
    encoding_json = json.dumps(encoding.tolist())
    cursor = conn.execute(
        "INSERT INTO workers (name, face_encoding, photo_path) VALUES (?, ?, ?)",
        (name, encoding_json, photo_path),
    )
    conn.commit()
    worker_id = cursor.lastrowid
    logger.info("Added worker: %s (id=%d)", name, worker_id)
    return worker_id


def get_all_workers() -> list[dict]:
    """Return all workers as dicts."""
    conn = _get_conn()
    rows = conn.execute("SELECT id, name, face_encoding, photo_path, synced_at FROM workers").fetchall()
    workers = []
    for row in rows:
        workers.append({
            "id": row["id"],
            "name": row["name"],
            "face_encoding": np.array(json.loads(row["face_encoding"]), dtype=np.float64),
            "photo_path": row["photo_path"],
            "synced_at": row["synced_at"],
        })
    return workers


def get_worker_encodings() -> tuple[list[np.ndarray], list[int], list[str]]:
    """Return (encodings, ids, names) for all workers."""
    workers = get_all_workers()
    encodings = [w["face_encoding"] for w in workers]
    ids = [w["id"] for w in workers]
    names = [w["name"] for w in workers]
    return encodings, ids, names


def log_attendance(worker_id: int, worker_name: str, event_type: str, confidence: float = 0.0) -> int:
    """Log an attendance event. Returns log ID."""
    conn = _get_conn()
    now = datetime.now().isoformat()
    cursor = conn.execute(
        "INSERT INTO attendance_log (worker_id, worker_name, event_type, timestamp, confidence, kiosk_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (worker_id, worker_name, event_type, now, confidence, config.KIOSK_ID),
    )
    conn.commit()
    log_id = cursor.lastrowid
    logger.info("Attendance logged: %s %s (id=%d, confidence=%.2f)", worker_name, event_type, log_id, confidence)
    return log_id


def get_unsynced_logs() -> list[dict]:
    """Return all unsynced attendance logs."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, worker_id, worker_name, event_type, timestamp, confidence, kiosk_id "
        "FROM attendance_log WHERE synced = 0"
    ).fetchall()
    return [dict(row) for row in rows]


def mark_synced(log_ids: list[int]):
    """Mark attendance logs as synced."""
    if not log_ids:
        return
    conn = _get_conn()
    placeholders = ",".join("?" for _ in log_ids)
    conn.execute(f"UPDATE attendance_log SET synced = 1 WHERE id IN ({placeholders})", log_ids)
    conn.commit()
    logger.info("Marked %d logs as synced", len(log_ids))


def get_sync_state(key: str) -> Optional[str]:
    """Get a sync state value."""
    conn = _get_conn()
    row = conn.execute("SELECT value FROM sync_state WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_sync_state(key: str, value: str):
    """Set a sync state value."""
    conn = _get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)",
        (key, value),
    )
    conn.commit()


def get_recent_clock(worker_id: int, minutes: int = 5) -> Optional[dict]:
    """Check if worker clocked in/out within last N minutes."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM attendance_log WHERE worker_id = ? "
        "AND timestamp > datetime('now', ? || ' minutes') ORDER BY timestamp DESC LIMIT 1",
        (worker_id, f"-{minutes}"),
    ).fetchone()
    return dict(row) if row else None


def get_today_logs(limit: int = 50) -> list[dict]:
    """Get today's attendance logs."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT id, worker_id, worker_name, event_type, timestamp, confidence "
        "FROM attendance_log WHERE date(timestamp) = date('now') "
        "ORDER BY timestamp DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]
