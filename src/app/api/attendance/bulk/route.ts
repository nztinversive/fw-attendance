import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../../convex/_generated/api';

export async function POST(req: NextRequest) {
  try {
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
      workerName: e.worker_name || e.workerName || undefined,
      confidence: typeof e.confidence === 'number' ? e.confidence : undefined,
      livenessConfirmed:
        typeof e.liveness_confirmed === 'boolean'
          ? e.liveness_confirmed
          : e.liveness_confirmed === 1
            ? true
            : e.liveness_confirmed === 0
              ? false
              : undefined,
    }));

    const result = await convex.mutation(api.attendance.bulkCreate, { events: mapped });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Attendance bulk POST error:', error);
    return NextResponse.json({ error: 'Failed to record attendance batch' }, { status: 500 });
  }
}
