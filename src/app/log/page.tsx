'use client';

import { useEffect, useState } from 'react';
import AttendanceTable from '@/components/AttendanceTable';
import { AttendanceWithWorker } from '@/lib/types';

export default function LogPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [events, setEvents] = useState<AttendanceWithWorker[]>([]);

  useEffect(() => {
    fetch(`/api/attendance?date=${date}`)
      .then((r) => r.json())
      .then(setEvents)
      .catch(console.error);
  }, [date]);

  const exportCSV = () => {
    const header = 'Time,Worker,Department,Event,Kiosk\n';
    const rows = events.map((e) =>
      `${e.timestamp},${e.worker_name},${e.worker_department},${e.event_type},${e.kiosk_name || ''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gatekeeper-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title text-slate-100">
            Activity <span className="text-gold">Log</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">{events.length} events recorded</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field w-auto"
          />
          <button onClick={exportCSV} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <AttendanceTable events={events} />
      </div>
    </div>
  );
}
