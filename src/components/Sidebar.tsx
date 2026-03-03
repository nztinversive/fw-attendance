'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/log', label: 'Log', icon: '📋' },
  { href: '/workers', label: 'Workers', icon: '👷' },
  { href: '/enroll', label: 'Enroll Face', icon: '🧑‍💻' },
  { href: '/kiosks', label: 'Kiosks', icon: '🖥️' },
  { href: '/schedules', label: 'Schedules', icon: '📅' },
  { href: '/reports', label: 'Reports', icon: '📈' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-900 border-r border-gray-800 min-h-screen fixed left-0 top-0 z-30">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">
            <span className="text-gold">FW</span> Gatekeeper
          </h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === l.href
                  ? 'bg-gold/20 text-gold'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex z-30">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 flex flex-col items-center py-2 text-xs ${
              pathname === l.href ? 'text-gold' : 'text-gray-500'
            }`}
          >
            <span className="text-lg">{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
