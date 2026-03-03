'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface WorkerHours {
  name: string;
  department: string;
  firstIn: string;
  lastOut: string;
  hours: number;
  late: boolean;
}

interface DayCount {
  date: string;
  count: number;
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [lateThreshold, setLateThreshold] = useState('06:00');
  const [workerHours, setWorkerHours] = useState<WorkerHours[]>([]);
  const [dailyCounts, setDailyCounts] = useState<DayCount[]>([]);

  useEffect(() => {
    const fetchReport = async () => {
      // Fetch gatekeeper data for each day in range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const allEvents: { worker_id: string; worker_name: string; worker_department: string; event_type: string; timestamp: string }[] = [];
      const counts: DayCount[] = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const res = await fetch(`/api/attendance?date=${dateStr}`);
        const events = await res.json();
        allEvents.push(...events);

        const uniqueWorkers = new Set(events.filter((e: { event_type: string }) => e.event_type === 'clock_in').map((e: { worker_id: string }) => e.worker_id));
        counts.push({ date: dateStr.slice(5), count: uniqueWorkers.size });
      }

      setDailyCounts(counts);

      // Per-worker hours for the range
      const workerMap = new Map<string, { name: string; department: string; ins: string[]; outs: string[] }>();

      for (const e of allEvents) {
        if (!workerMap.has(e.worker_id)) {
          workerMap.set(e.worker_id, { name: e.worker_name, department: e.worker_department, ins: [], outs: [] });
        }
        const w = workerMap.get(e.worker_id)!;
        if (e.event_type === 'clock_in') w.ins.push(e.timestamp);
        else w.outs.push(e.timestamp);
      }

      const thresholdMinutes = parseInt(lateThreshold.split(':')[0]) * 60 + parseInt(lateThreshold.split(':')[1]);

      const hours: WorkerHours[] = [];
      for (const [, w] of workerMap) {
        if (w.ins.length === 0) continue;
        const firstIn = w.ins.sort()[0];
        const lastOut = w.outs.length > 0 ? w.outs.sort().reverse()[0] : firstIn;
        const diffMs = new Date(lastOut).getTime() - new Date(firstIn).getTime();
        const h = Math.round((diffMs / 3600000) * 10) / 10;

        const inDate = new Date(firstIn);
        const inMinutes = inDate.getUTCHours() * 60 + inDate.getUTCMinutes();
        const late = inMinutes > thresholdMinutes;

        hours.push({
          name: w.name,
          department: w.department,
          firstIn: new Date(firstIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          lastOut: new Date(lastOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          hours: h,
          late,
        });
      }

      hours.sort((a, b) => a.name.localeCompare(b.name));
      setWorkerHours(hours);
    };

    fetchReport();
  }, [startDate, endDate, lateThreshold]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6"><span className="text-gold">Gatekeeper</span> Reports</h1>

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Late After (UTC)</label>
          <input type="time" value={lateThreshold} onChange={(e) => setLateThreshold(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      {/* Weekly chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Daily Activity</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyCounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 12 }} />
              <YAxis tick={{ fill: '#888', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }} />
              <Bar dataKey="count" fill="#B8860B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Worker hours table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="text-left py-3 px-3">Worker</th>
              <th className="text-left py-3 px-3">Dept</th>
              <th className="text-left py-3 px-3">First In</th>
              <th className="text-left py-3 px-3">Last Out</th>
              <th className="text-left py-3 px-3">Hours</th>
              <th className="text-left py-3 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {workerHours.map((w, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-2.5 px-3 font-medium">{w.name}</td>
                <td className="py-2.5 px-3 text-gray-400 text-xs">{w.department}</td>
                <td className="py-2.5 px-3 font-mono text-xs">{w.firstIn}</td>
                <td className="py-2.5 px-3 font-mono text-xs">{w.lastOut}</td>
                <td className="py-2.5 px-3 text-gold font-medium">{w.hours}h</td>
                <td className="py-2.5 px-3">
                  {w.late ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400">Late</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-400/10 text-green-400">On Time</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
