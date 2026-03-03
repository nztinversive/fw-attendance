"""End-to-end test for the FW Gatekeeper system.

Tests the complete flow:
  1. Enroll a worker (simulate webcam → /api/enroll → /encode pipeline)
  2. Face match (simulate recognition → clock_in)
  3. Sync attendance to server (/api/attendance/bulk)
  4. Sync workers from server (/api/sync)
  5. Verify data consistency

Usage:
  SERVER_URL=http://localhost:3000 py e2e_test.py
  Or run with face-service on localhost:5557 for full pipeline.
"""

import json
import os
import sys
import time
import sqlite3
import base64
from datetime import datetime
from pathlib import Path

# Allow running standalone
sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault("KIOSK_ID", "test-kiosk-e2e")
os.environ.setdefault("DB_PATH", str(Path(__file__).parent / "data" / "e2e_test.db"))

import config
import database

# Suppress noisy logs during test
import logging
logging.basicConfig(level=logging.WARNING)

PASSED = 0
FAILED = 0
ERRORS: list[str] = []

def ok(name: str):
    global PASSED
    PASSED += 1
    print(f"  ✅ {name}")

def fail(name: str, detail: str = ""):
    global FAILED
    FAILED += 1
    msg = f"  ❌ {name}" + (f" — {detail}" if detail else "")
    print(msg)
    ERRORS.append(msg)

def section(title: str):
    print(f"\n{'='*50}")
    print(f"  {title}")
    print(f"{'='*50}")

# ---------------------------------------------------------------------------
# 1. Local database tests (no server required)
# ---------------------------------------------------------------------------
section("1. Database Layer")

# Clean slate
db_path = Path(config.DB_PATH)
if db_path.exists():
    db_path.unlink()

database.init_db()
ok("init_db() succeeds")

# Enroll a test worker with a dummy encoding
import numpy as np
dummy_encoding = np.random.randn(128).astype(np.float64)
wid = database.add_worker("Test Worker", dummy_encoding, photo_paths=["/tmp/test1.jpg"])
if wid > 0:
    ok(f"add_worker() returned id={wid}")
else:
    fail("add_worker()", f"got id={wid}")

# Retrieve worker
w = database.get_worker_by_name("Test Worker")
if w and w["name"] == "Test Worker":
    ok("get_worker_by_name() found worker")
else:
    fail("get_worker_by_name()", f"got {w}")

# Verify encoding round-trip
if w:
    retrieved = w["encoding_blob"]
    if np.allclose(dummy_encoding, retrieved, atol=1e-10):
        ok("encoding round-trip (binary blob)")
    else:
        fail("encoding round-trip", f"max diff={np.max(np.abs(dummy_encoding - retrieved))}")

# Log attendance
log_id = database.log_attendance(wid, "Test Worker", "clock_in", liveness_confirmed=True, confidence=0.92)
if log_id > 0:
    ok(f"log_attendance(clock_in) id={log_id}")
else:
    fail("log_attendance()", f"got id={log_id}")

# Check recent clock
if database.was_recently_clocked(wid, minutes=5):
    ok("was_recently_clocked() = True (just clocked)")
else:
    fail("was_recently_clocked()", "expected True")

# Last action
last = database.get_last_action(wid)
if last == "clock_in":
    ok(f"get_last_action() = {last}")
else:
    fail("get_last_action()", f"expected clock_in, got {last}")

# Today logs
logs = database.get_today_logs()
if len(logs) >= 1:
    ok(f"get_today_logs() returned {len(logs)} log(s)")
    # Verify backward-compat alias
    if logs[0].get("event_type") == "clock_in":
        ok("today_logs includes event_type alias")
    else:
        fail("event_type alias in today_logs", f"got {logs[0].get('event_type')}")
else:
    fail("get_today_logs()", "expected >= 1")

# Unsynced logs (for server sync)
unsynced = database.get_unsynced_logs()
if len(unsynced) >= 1:
    ok(f"get_unsynced_logs() returned {len(unsynced)} log(s)")
    # Verify both action AND event_type present
    entry = unsynced[0]
    if entry.get("action") and entry.get("event_type"):
        ok("unsynced log has both 'action' and 'event_type' fields")
        if entry["action"] == entry["event_type"]:
            ok("action == event_type (no mismatch)")
        else:
            fail("field mismatch!", f"action={entry['action']} event_type={entry['event_type']}")
    else:
        fail("unsynced log fields", f"action={entry.get('action')} event_type={entry.get('event_type')}")
else:
    fail("get_unsynced_logs()", "expected >= 1")

# Clock out
log_id2 = database.log_attendance(wid, "Test Worker", "clock_out", confidence=0.88)
last2 = database.get_last_action(wid)
if last2 == "clock_out":
    ok("clock_out logged and last_action updated")
else:
    fail("clock_out", f"last_action={last2}")

# Mark synced
database.mark_synced([log_id, log_id2])
unsynced2 = database.get_unsynced_logs()
if len(unsynced2) == 0:
    ok("mark_synced() cleared unsynced logs")
else:
    fail("mark_synced()", f"still {len(unsynced2)} unsynced")

# ---------------------------------------------------------------------------
# 2. Server sync tests (requires running server)
# ---------------------------------------------------------------------------
section("2. Server Sync (requires server)")

SERVER_URL = os.environ.get("SERVER_URL", config.SERVER_URL)
server_available = False

try:
    import requests
    r = requests.get(f"{SERVER_URL}/api/health", timeout=5)
    server_available = r.status_code == 200
except Exception as e:
    print(f"  ⚠️  Server not available at {SERVER_URL}: {e}")
    print("  Skipping server sync tests. Start the Next.js dashboard to test.")

if server_available:
    ok(f"Server healthy at {SERVER_URL}")

    # Test bulk attendance upload
    test_logs = [
        {
            "id": f"e2e-test-{int(time.time())}",
            "worker_id": "test-worker-1",
            "worker_name": "E2E Test Worker",
            "action": "clock_in",
            "event_type": "clock_in",
            "timestamp": datetime.now().isoformat(),
            "confidence": 0.95,
            "liveness_confirmed": True,
            "kiosk_id": "test-kiosk-e2e",
        }
    ]

    r = requests.post(
        f"{SERVER_URL}/api/attendance/bulk",
        json={"kiosk_id": "test-kiosk-e2e", "logs": test_logs},
        timeout=15,
    )
    if r.status_code == 200:
        data = r.json()
        ok(f"bulk attendance sync: {data.get('synced', 0)} record(s)")
    else:
        fail("bulk attendance sync", f"status={r.status_code} body={r.text[:200]}")

    # Test worker sync (download)
    r = requests.get(
        f"{SERVER_URL}/api/sync",
        params={"kiosk_id": "test-kiosk-e2e", "since": "2000-01-01T00:00:00"},
        timeout=15,
    )
    if r.status_code == 200:
        data = r.json()
        workers = data.get("workers", [])
        ok(f"worker sync: received {len(workers)} worker(s)")
    else:
        fail("worker sync", f"status={r.status_code} body={r.text[:200]}")

# ---------------------------------------------------------------------------
# 3. Face encoding service test (requires face-service running)
# ---------------------------------------------------------------------------
section("3. Face Encode Service (requires face-service)")

encode_url = os.environ.get("FACE_ENCODE_URL", "http://localhost:5557")
encode_available = False

try:
    import requests
    r = requests.get(f"{encode_url}/health", timeout=5)
    encode_available = r.status_code == 200
except Exception as e:
    print(f"  ⚠️  Face service not available at {encode_url}: {e}")
    print("  Skipping face encoding tests. Start face-service to test.")

if encode_available:
    ok(f"Face service healthy at {encode_url}")

    # Create a minimal test image (white 100x100 — won't contain a face but tests the pipeline)
    from PIL import Image
    import io
    img = Image.new("RGB", (100, 100), color="white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    test_photo = f"data:image/jpeg;base64,{b64}"

    r = requests.post(
        f"{encode_url}/encode",
        json={"photos": [test_photo, test_photo, test_photo]},
        timeout=15,
    )
    if r.status_code == 422:
        ok("encode correctly rejects photos with no face (422)")
    elif r.status_code == 200:
        data = r.json()
        if isinstance(data.get("encoding"), list) and len(data["encoding"]) == 128:
            ok(f"encode returned 128-dim encoding")
        else:
            fail("encode response", f"unexpected shape: {len(data.get('encoding', []))}")
    else:
        fail("encode endpoint", f"status={r.status_code}")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
section("RESULTS")

# Cleanup test DB
if db_path.exists():
    db_path.unlink()

total = PASSED + FAILED
print(f"\n  {PASSED}/{total} passed, {FAILED} failed\n")
if ERRORS:
    print("  Failures:")
    for e in ERRORS:
        print(f"    {e}")
    print()

sys.exit(1 if FAILED > 0 else 0)
