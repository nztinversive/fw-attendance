export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
  const db = getDb();
  const schedules = db.prepare('SELECT * FROM schedules WHERE active = 1 ORDER BY created_at DESC').all();
  return NextResponse.json(schedules);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const { name, days, start_time, end_time, department } = await req.json();

  if (!name || !days || !start_time || !end_time) {
    return NextResponse.json({ error: 'name, days, start_time, and end_time required' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO schedules (id, name, days, start_time, end_time, department, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
  ).run(id, name, JSON.stringify(days), start_time, end_time, department || null, new Date().toISOString());

  return NextResponse.json({ id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const db = getDb();
  const { id, name, days, start_time, end_time, department } = await req.json();

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const fields: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (days !== undefined) { fields.push('days = ?'); values.push(JSON.stringify(days)); }
  if (start_time !== undefined) { fields.push('start_time = ?'); values.push(start_time); }
  if (end_time !== undefined) { fields.push('end_time = ?'); values.push(end_time); }
  if (department !== undefined) { fields.push('department = ?'); values.push(department || null); }

  if (fields.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(id);
  db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const db = getDb();
  const id = req.nextUrl.searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  db.prepare('UPDATE schedules SET active = 0 WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
