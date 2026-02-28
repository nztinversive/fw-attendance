import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const db = getDb();
  const { events } = await req.json();

  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'events array required' }, { status: 400 });
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO attendance (id, worker_id, event_type, kiosk_id, timestamp, synced) VALUES (?, ?, ?, ?, ?, 1)'
  );

  const tx = db.transaction(() => {
    let count = 0;
    for (const e of events) {
      insert.run(e.id || crypto.randomUUID(), e.worker_id, e.event_type, e.kiosk_id || null, e.timestamp);
      count++;
    }
    return count;
  });

  const count = tx();
  return NextResponse.json({ synced: count });
}
