import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'FW Attendance',
  description: 'Fading West Factory Attendance System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Sidebar />
        <main className="md:ml-56 min-h-screen pb-20 md:pb-0">
          <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
        </main>
      </body>
    </html>
  );
}
