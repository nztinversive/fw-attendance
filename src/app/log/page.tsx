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
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">
          <span className="text-gold">Attendance</span> Log
        </h1>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-sm focus:outline-none focus:border-gold/50"
          />
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 bg-gold hover:bg-gold-light text-black rounded-lg text-sm font-medium"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <AttendanceTable events={events} />
      </div>
    </div>
  );
}
