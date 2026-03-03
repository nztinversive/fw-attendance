export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';

export async function GET() {
  try {
    // Seed on first run
    await convex.mutation(api.seed.run, {});

    const stats = await convex.query(api.stats.get, {});
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
