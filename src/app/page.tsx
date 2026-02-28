'use client';

import { useEffect, useState, useCallback } from 'react';
import StatsBar from '@/components/StatsBar';
import WorkerCard from '@/components/WorkerCard';

interface WorkerWithStatus {
  id: string;
  name: string;
  department: string;
  status: 'in' | 'out' | 'absent';
  clockInTime?: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ totalWorkers: 0, clockedIn: 0, clockedOut: 0, notArrived: 0, avgArrival: null as string | null });
  const [workers, setWorkers] = useState<WorkerWithStatus[]>([]);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, workersRes, attendanceRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/workers'),
        fetch(`/api/attendance?date=${new Date().toISOString().split('T')[0]}`),
      ]);

      const statsData = await statsRes.json();
      const workersData = await workersRes.json();
      const attendanceData = await attendanceRes.json();

      setStats(statsData);

      // Build status map: latest event per worker
      const statusMap = new Map<string, { event_type: string; timestamp: string }>();
      for (const e of attendanceData) {
        const existing = statusMap.get(e.worker_id);
        if (!existing || e.timestamp > existing.timestamp) {
          statusMap.set(e.worker_id, { event_type: e.event_type, timestamp: e.timestamp });
        }
      }

      const enriched: WorkerWithStatus[] = workersData.map((w: { id: string; name: string; department: string }) => {
        const latest = statusMap.get(w.id);
        let status: 'in' | 'out' | 'absent' = 'absent';
        let clockInTime: string | undefined;

        if (latest) {
          status = latest.event_type === 'clock_in' ? 'in' : 'out';
          clockInTime = new Date(latest.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }

        return { ...w, status, clockInTime };
      });

      // Sort: in first, then out, then absent
      enriched.sort((a, b) => {
        const order = { in: 0, out: 1, absent: 2 };
        return order[a.status] - order[b.status];
      });

      setWorkers(enriched);
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = workers.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.department.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          <span className="text-gold">FW</span> Live Board
        </h1>
        {stats.avgArrival && (
          <span className="text-xs text-gray-500">Avg arrival: {stats.avgArrival}</span>
        )}
      </div>

      <StatsBar stats={stats} />

      <input
        type="text"
        placeholder="Search by name or department..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full md:w-80 mb-4 px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((w) => (
          <WorkerCard key={w.id} name={w.name} department={w.department} status={w.status} clockInTime={w.clockInTime} />
        ))}
      </div>
    </div>
  );
}
