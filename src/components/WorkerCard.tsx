'use client';

interface WorkerCardProps {
  name: string;
  department: string;
  status: 'in' | 'out' | 'absent';
  clockInTime?: string;
}

export default function WorkerCard({ name, department, status, clockInTime }: WorkerCardProps) {
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2);
  const dotColor = status === 'in' ? 'bg-green-400' : status === 'out' ? 'bg-orange-400' : 'bg-gray-600';
  const statusText = status === 'in' ? 'Clocked In' : status === 'out' ? 'Clocked Out' : 'Not Arrived';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3 hover:border-gold/30 transition-colors">
      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-gold shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{name}</div>
        <div className="text-xs text-gray-500">{department}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1.5 justify-end">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-xs text-gray-400">{statusText}</span>
        </div>
        {clockInTime && (
          <div className="text-[10px] text-gray-600 mt-0.5">{clockInTime}</div>
        )}
      </div>
    </div>
  );
}
