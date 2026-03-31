'use client';

import { DashboardStats } from '@/lib/types';

const StatIcon = ({ type }: { type: string }) => {
  if (type === 'total') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
  if (type === 'in') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
  if (type === 'out') return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
};

export default function StatsBar({ stats }: { stats: DashboardStats & { avgArrival?: string | null } }) {
  const items = [
    { label: 'Total Workers', value: stats.totalWorkers, color: 'text-gold', bg: 'bg-gold/8', border: 'border-gold/15', iconType: 'total', iconColor: 'text-gold/60' },
    { label: 'Clocked In', value: stats.clockedIn, color: 'text-emerald-400', bg: 'bg-emerald-400/8', border: 'border-emerald-400/15', iconType: 'in', iconColor: 'text-emerald-400/60' },
    { label: 'Clocked Out', value: stats.clockedOut, color: 'text-amber-400', bg: 'bg-amber-400/8', border: 'border-amber-400/15', iconType: 'out', iconColor: 'text-amber-400/60' },
    { label: 'Not Arrived', value: stats.notArrived, color: 'text-slate-400', bg: 'bg-slate-400/5', border: 'border-slate-500/15', iconType: 'waiting', iconColor: 'text-slate-500/60' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`glass-card p-4 md:p-5 animate-fade-in stagger-${i + 1}`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`p-2 rounded-lg ${item.bg} ${item.border} border`}>
              <span className={item.iconColor}>
                <StatIcon type={item.iconType} />
              </span>
            </div>
          </div>
          <div className={`text-3xl font-display font-bold tabular-nums ${item.color}`}>
            {item.value}
          </div>
          <div className="section-label mt-1">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
