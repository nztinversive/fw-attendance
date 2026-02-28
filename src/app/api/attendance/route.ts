export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const db = getDb();
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
  const workerId = req.nextUrl.searchParams.get('worker_id');

  let sql = `
    SELECT a.*, w.name as worker_name, w.department as worker_department, k.name as kiosk_name
    FROM attendance a
    JOIN workers w ON a.worker_id = w.id
    LEFT JOIN kiosks k ON a.kiosk_id = k.id
    WHERE a.timestamp LIKE ?
  `;
  const params: unknown[] = [`${date}%`];

  if (workerId) {
    sql += ' AND a.worker_id = ?';
    params.push(workerId);
  }

  sql += ' ORDER BY a.timestamp DESC';

  const rows = db.prepare(sql).all(...params);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  const { worker_id, event_type, kiosk_id, timestamp } = body;

  if (!worker_id || !event_type) {
    return NextResponse.json({ error: 'worker_id and event_type required' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO attendance (id, worker_id, event_type, kiosk_id, timestamp, synced) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(id, worker_id, event_type, kiosk_id || null, timestamp || new Date().toISOString());

  return NextResponse.json({ id }, { status: 201 });
}
