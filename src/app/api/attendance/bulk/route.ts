import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../../convex/_generated/api';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const events = body.events || body.logs;
  const bulkKioskId = body.kiosk_id;

  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'events (or logs) array required' }, { status: 400 });
  }

  const mapped = events.map((e: any) => ({
    workerId: e.worker_id,
    eventType: e.event_type || e.action,
    kioskId: e.kiosk_id || bulkKioskId || undefined,
    timestamp: e.timestamp,
    workerName: e.worker_name || undefined,
    confidence: e.confidence || undefined,
    livenessConfirmed: e.liveness_confirmed ? true : undefined,
  }));

  const result = await convex.mutation(api.attendance.bulkCreate, { events: mapped });
  return NextResponse.json(result);
}
