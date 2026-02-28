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

  // Return workers updated since timestamp
  const workers = db.prepare(
    'SELECT id, name, department, photo_url, face_encoding, enrolled_at, active FROM workers WHERE enrolled_at > ? OR active = 1'
  ).all(since);

  return NextResponse.json({ workers, synced_at: new Date().toISOString() });
}
