export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * POST /api/workers/encode
 * Accepts: { worker_id, encoding: number[] }
 * Stores a pre-computed face encoding for a worker.
 * Used by the Pi kiosk or local face-service to push encodings back to server.
 */
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json().catch(() => ({}));
    const { worker_id, encoding } = body;

    if (!worker_id || !encoding || !Array.isArray(encoding)) {
      return NextResponse.json({ error: 'worker_id and encoding (array) required' }, { status: 400 });
    }

    const worker = db.prepare('SELECT id, name FROM workers WHERE id = ? AND active = 1').get(worker_id) as { id: string; name: string } | undefined;
    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    db.prepare('UPDATE workers SET face_encoding = ? WHERE id = ?').run(JSON.stringify(encoding), worker_id);

    return NextResponse.json({
      ok: true,
      worker_id,
      name: worker.name,
      encoding_length: encoding.length,
    });
  } catch (error) {
    console.error('Encode POST error:', error);
    return NextResponse.json({ error: 'Failed to save encoding' }, { status: 500 });
  }
}
