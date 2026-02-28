export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const db = getDb();
  const includeEncodings = req.nextUrl.searchParams.get('include_encodings') === 'true';

  const cols = includeEncodings
    ? 'id, name, department, photo_url, face_encoding, enrolled_at, active'
    : 'id, name, department, photo_url, enrolled_at, active';

  const workers = db.prepare(`SELECT ${cols} FROM workers WHERE active = 1 ORDER BY name`).all();
  return NextResponse.json(workers);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  const { name, department, photo, face_encoding } = body;

  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const id = crypto.randomUUID();
  let photo_url: string | null = null;

  if (photo) {
    const photosDir = path.join(process.cwd(), 'data', 'photos');
    if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
    fs.writeFileSync(path.join(photosDir, `${id}.txt`), photo);
    photo_url = `/data/photos/${id}.txt`;
  }

  db.prepare(
    'INSERT INTO workers (id, name, department, photo_url, face_encoding, enrolled_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).run(id, name, department || '', photo_url, face_encoding ? JSON.stringify(face_encoding) : null, new Date().toISOString());

  return NextResponse.json({ id, name, department: department || '' }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  const { id, name, department, photo, face_encoding } = body;

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
  if (department !== undefined) { sets.push('department = ?'); vals.push(department); }
  if (face_encoding !== undefined) { sets.push('face_encoding = ?'); vals.push(JSON.stringify(face_encoding)); }

  if (photo) {
    const photosDir = path.join(process.cwd(), 'data', 'photos');
    if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
    fs.writeFileSync(path.join(photosDir, `${id}.txt`), photo);
    sets.push('photo_url = ?');
    vals.push(`/data/photos/${id}.txt`);
  }

  if (sets.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  vals.push(id);
  db.prepare(`UPDATE workers SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const db = getDb();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  db.prepare('UPDATE workers SET active = 0 WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
