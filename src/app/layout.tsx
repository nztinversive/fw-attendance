import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'FW Gatekeeper',
  description: 'Fading West Factory Gatekeeper System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
