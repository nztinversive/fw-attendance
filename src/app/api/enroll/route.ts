export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
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

    // Upload photos to Convex storage
    const storageIds: string[] = [];
    for (const photo of photos) {
      try {
        const uploadUrl = await convex.mutation(api.workers.generateUploadUrl, {});
        const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'image/jpeg' });

        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });

        if (uploadRes.ok) {
          const { storageId } = await uploadRes.json();
          storageIds.push(storageId);
        }
      } catch (uploadErr) {
        console.error('Failed to upload photo:', uploadErr);
      }
    }

    // Try face encoding service
    let faceEncoding: number[] | undefined;
    try {
      const encodeUrl = process.env.FACE_ENCODE_URL || 'http://localhost:5557/encode';
      const encodeRes = await fetch(encodeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos }),
        signal: AbortSignal.timeout(60000), // 60s — face service cold start + encoding
      });
      const encodeBody = await encodeRes.json();
      if (encodeRes.ok) {
        faceEncoding = encodeBody.encoding;
        console.log('Face encoding success:', faceEncoding?.length, 'dimensions');
      } else {
        console.error('Face encoding service returned', encodeRes.status, encodeBody);
      }
    } catch (encodeErr) {
      console.error('Face encoding failed:', encodeErr);
    }

    const result = await convex.mutation(api.workers.create, {
      name: name.trim(),
      department: department?.trim() || undefined,
      faceEncoding,
      photoStorageIds: storageIds.length > 0 ? storageIds as any : undefined,
    });

    return NextResponse.json(
      {
        id: result.id,
        name: name.trim(),
        photosCount: storageIds.length,
        encoded: faceEncoding !== undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Enrollment error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
