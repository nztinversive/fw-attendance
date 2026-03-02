import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  // Accept both { events: [...] } and { kiosk_id, logs: [...] } formats
  const events = body.events || body.logs;
  const bulkKioskId = body.kiosk_id;

  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'events (or logs) array required' }, { status: 400 });
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO attendance (id, worker_id, event_type, kiosk_id, timestamp, synced, worker_name, confidence, liveness_confirmed) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    let count = 0;
    for (const e of events) {
      insert.run(
        e.id || crypto.randomUUID(),
        e.worker_id,
        e.event_type || e.action,
        e.kiosk_id || bulkKioskId || null,
        e.timestamp,
        e.worker_name || '',
        e.confidence || 0.0,
        e.liveness_confirmed ? 1 : 0
      );
      count++;
    }
    return count;
  });

  const count = tx();
  return NextResponse.json({ synced: count });
}
