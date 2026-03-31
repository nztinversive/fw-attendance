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
  const [lastUpdated, setLastUpdated] = useState<string>('');

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
      setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
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
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title text-slate-100">
            Live <span className="text-gold">Dashboard</span>
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1.5">
              <span className="status-dot-pulse bg-emerald-400" />
              <span className="text-xs font-mono text-slate-500">Live</span>
            </span>
            {lastUpdated && (
              <span className="text-xs font-mono text-slate-600">Updated {lastUpdated}</span>
            )}
            {stats.avgArrival && (
              <span className="text-xs font-mono text-slate-600">Avg arrival {stats.avgArrival}</span>
            )}
          </div>
        </div>
      </div>

      <StatsBar stats={stats} />

      {/* Search */}
      <div className="relative mb-6">
        <svg className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          placeholder="Search workers by name or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-11 w-full md:w-96"
        />
      </div>

      {/* Worker grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((w) => (
          <WorkerCard key={w.id} name={w.name} department={w.department} status={w.status} clockInTime={w.clockInTime} />
        ))}
      </div>

      {filtered.length === 0 && workers.length > 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="font-display text-lg">No workers match your search</p>
          <p className="text-sm mt-1">Try a different name or department</p>
        </div>
      )}
    </div>
  );
}
