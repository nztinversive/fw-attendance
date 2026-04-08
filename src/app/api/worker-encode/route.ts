export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';
import { getEncodingValidationMessage, isSupportedEncoding } from '@/lib/encoding';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { worker_id, encoding } = body;

    if (!worker_id || !encoding || !Array.isArray(encoding)) {
      return NextResponse.json({ error: 'worker_id and encoding (array) required' }, { status: 400 });
    }
    if (!isSupportedEncoding(encoding)) {
      return NextResponse.json({ error: getEncodingValidationMessage('encoding') }, { status: 400 });
    }

    const worker = await convex.query(api.workers.get, { id: worker_id as any });
    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    await convex.mutation(api.workers.update, {
      id: worker_id as any,
      faceEncoding: encoding,
    });

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
