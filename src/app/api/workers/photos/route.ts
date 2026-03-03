export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/workers/photos?worker_id=xxx
 * Returns base64-encoded photos for a worker (for remote encoding).
 */
export async function GET(req: NextRequest) {
  try {
    const workerId = req.nextUrl.searchParams.get('worker_id');
    if (!workerId) {
      return NextResponse.json({ error: 'worker_id required' }, { status: 400 });
    }

    const db = getDb();
    const worker = db.prepare('SELECT * FROM workers WHERE id = ? AND active = 1').get(workerId) as { id: string; name: string; photo_url: string | null } | undefined;

    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    // Find all photos in the worker's photo directory
    const photosDir = path.join(process.cwd(), 'data', 'photos', workerId);
    if (!fs.existsSync(photosDir)) {
      return NextResponse.json({ error: 'No photos found', photos: [] }, { status: 404 });
    }

    const files = fs.readdirSync(photosDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
    const photos: string[] = [];

    for (const file of files) {
      const filepath = path.join(photosDir, file);
      const buffer = fs.readFileSync(filepath);
      const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      photos.push(base64);
    }

    return NextResponse.json({
      worker_id: workerId,
      name: worker.name,
      photos,
      count: photos.length,
    });
  } catch (error) {
    console.error('Photos GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }
}
