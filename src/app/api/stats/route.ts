export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || undefined;
    const stats = await convex.query(api.stats.get, { date });
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
