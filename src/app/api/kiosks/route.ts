export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
  const db = getDb();
  const kiosks = db.prepare('SELECT * FROM kiosks WHERE active = 1 ORDER BY name').all();
  return NextResponse.json(kiosks);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const { name, type, location } = await req.json();

  if (!name || !type) return NextResponse.json({ error: 'name and type required' }, { status: 400 });

  const id = crypto.randomUUID();
  db.prepare('INSERT INTO kiosks (id, name, type, location, active) VALUES (?, ?, ?, ?, 1)')
    .run(id, name, type, location || '');

  return NextResponse.json({ id, name, type }, { status: 201 });
}
