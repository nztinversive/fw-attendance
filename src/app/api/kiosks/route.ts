export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';

export async function GET() {
  const kiosks = await convex.query(api.kiosks.list, {});
  return NextResponse.json(kiosks);
}

export async function POST(req: NextRequest) {
  const { name, type, location } = await req.json();
  if (!name || !type) return NextResponse.json({ error: 'name and type required' }, { status: 400 });

  const result = await convex.mutation(api.kiosks.create, {
    name,
    type,
    location: location || undefined,
  });
  return NextResponse.json(result, { status: 201 });
}
