'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="md:ml-56 min-h-screen pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
      </main>
    </>
  );
}
