export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const db = getDb();
  const kioskId = req.nextUrl.searchParams.get('kiosk_id');
  const since = req.nextUrl.searchParams.get('since') || '1970-01-01T00:00:00.000Z';

  if (!kioskId) return NextResponse.json({ error: 'kiosk_id required' }, { status: 400 });

  // Update kiosk last_sync
  db.prepare('UPDATE kiosks SET last_sync = ? WHERE id = ?').run(new Date().toISOString(), kioskId);

  // Return workers — parse face_encoding from JSON string to array for Pi consumption
  const rawWorkers = db.prepare(
    'SELECT id, name, department, photo_url, face_encoding, enrolled_at, active FROM workers WHERE enrolled_at > ? OR active = 1'
  ).all(since) as Array<{ id: string; name: string; department: string; photo_url: string | null; face_encoding: string | null; enrolled_at: string; active: number }>;

  const workers = rawWorkers.map((w) => ({
    ...w,
    face_encoding: w.face_encoding ? JSON.parse(w.face_encoding) : null,
  }));

  return NextResponse.json({ workers, synced_at: new Date().toISOString() });
}
