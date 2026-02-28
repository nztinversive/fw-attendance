'use client';

import { AttendanceWithWorker } from '@/lib/types';

export default function AttendanceTable({ events }: { events: AttendanceWithWorker[] }) {
  if (events.length === 0) {
    return <div className="text-gray-500 text-center py-8">No attendance records for this date.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
            <th className="text-left py-3 px-3">Time</th>
            <th className="text-left py-3 px-3">Worker</th>
            <th className="text-left py-3 px-3">Event</th>
            <th className="text-left py-3 px-3">Kiosk</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-900/50">
              <td className="py-2.5 px-3 text-gray-300 font-mono text-xs">
                {new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-2.5 px-3">
                <div className="font-medium">{e.worker_name}</div>
                <div className="text-xs text-gray-500">{e.worker_department}</div>
              </td>
              <td className="py-2.5 px-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  e.event_type === 'clock_in'
                    ? 'bg-green-400/10 text-green-400'
                    : 'bg-orange-400/10 text-orange-400'
                }`}>
                  {e.event_type === 'clock_in' ? '↓ In' : '↑ Out'}
                </span>
              </td>
              <td className="py-2.5 px-3 text-gray-400 text-xs">{e.kiosk_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
