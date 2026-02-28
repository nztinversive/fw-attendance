'use client';

import { DashboardStats } from '@/lib/types';

export default function StatsBar({ stats }: { stats: DashboardStats & { avgArrival?: string | null } }) {
  const items = [
    { label: 'Total Workers', value: stats.totalWorkers, color: 'text-gold' },
    { label: 'Clocked In', value: stats.clockedIn, color: 'text-green-400' },
    { label: 'Clocked Out', value: stats.clockedOut, color: 'text-orange-400' },
    { label: 'Not Arrived', value: stats.notArrived, color: 'text-gray-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map((item) => (
        <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
          <div className="text-xs text-gray-500 mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
