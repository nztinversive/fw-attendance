export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const totalWorkers = (db.prepare('SELECT COUNT(*) as c FROM workers WHERE active = 1').get() as { c: number }).c;

  // Get latest event per worker today
  const latestEvents = db.prepare(`
    SELECT worker_id, event_type, timestamp,
      ROW_NUMBER() OVER (PARTITION BY worker_id ORDER BY timestamp DESC) as rn
    FROM attendance
    WHERE timestamp LIKE ?
  `).all(`${today}%`) as { worker_id: string; event_type: string; timestamp: string; rn: number }[];

  const workerStatus = new Map<string, { event_type: string; timestamp: string }>();
  for (const e of latestEvents) {
    if (e.rn === 1) workerStatus.set(e.worker_id, { event_type: e.event_type, timestamp: e.timestamp });
  }

  let clockedIn = 0;
  let clockedOut = 0;
  for (const s of workerStatus.values()) {
    if (s.event_type === 'clock_in') clockedIn++;
    else clockedOut++;
  }

  const notArrived = totalWorkers - workerStatus.size;

  // Average arrival time
  const clockIns = db.prepare(`
    SELECT MIN(timestamp) as first_in, worker_id
    FROM attendance
    WHERE timestamp LIKE ? AND event_type = 'clock_in'
    GROUP BY worker_id
  `).all(`${today}%`) as { first_in: string; worker_id: string }[];

  let avgArrival: string | null = null;
  if (clockIns.length > 0) {
    const totalMinutes = clockIns.reduce((sum, r) => {
      const d = new Date(r.first_in);
      return sum + d.getUTCHours() * 60 + d.getUTCMinutes();
    }, 0);
    const avgMin = Math.round(totalMinutes / clockIns.length);
    const h = Math.floor(avgMin / 60);
    const m = avgMin % 60;
    avgArrival = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  return NextResponse.json({
    totalWorkers,
    clockedIn,
    clockedOut,
    notArrived,
    avgArrival,
  });
}
