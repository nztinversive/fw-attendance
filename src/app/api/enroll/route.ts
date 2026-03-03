export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/enroll
 * Accepts: { name, department?, photos: string[] }
 * photos = array of base64 JPEG data URLs from the enrollment webcam flow.
 *
 * Face encoding is done server-side by calling the Pi kiosk's Python encode endpoint,
 * or stored as raw photos for the Pi to encode on next sync.
 *
 * For now: stores photos + creates worker record. The Pi kiosk syncs encodings.
 */
export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  const { name, department, photos } = body as {
    name?: string;
    department?: string;
    photos?: string[];
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  if (!photos || photos.length < 3) {
    return NextResponse.json(
      { error: 'At least 3 photos required for enrollment' },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const photosDir = path.join(process.cwd(), 'data', 'photos', id);
  if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

  const savedPaths: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const base64Data = photos[i].replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `capture_${i + 1}.jpg`;
    const filepath = path.join(photosDir, filename);
    fs.writeFileSync(filepath, buffer);
    savedPaths.push(filepath);
  }

  // Try to generate face encoding via the Python encode service
  let faceEncoding: number[] | null = null;
  try {
    const encodeUrl = process.env.FACE_ENCODE_URL || 'http://localhost:5557/encode';
    const encodeRes = await fetch(encodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photos: photos }),
      signal: AbortSignal.timeout(3000),
    });
    if (encodeRes.ok) {
      const encodeData = await encodeRes.json();
      faceEncoding = encodeData.encoding;
    }
  } catch {
    // Encoding service not available — photos will be encoded on Pi sync
  }

  db.prepare(
    'INSERT INTO workers (id, name, department, photo_url, face_encoding, enrolled_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
  ).run(
    id,
    name.trim(),
    department?.trim() || '',
    savedPaths[0] || null,
    faceEncoding ? JSON.stringify(faceEncoding) : null,
    new Date().toISOString()
  );

  return NextResponse.json(
    {
      id,
      name: name.trim(),
      photosCount: savedPaths.length,
      encoded: faceEncoding !== null,
    },
    { status: 201 }
  );
}
