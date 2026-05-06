import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/Toaster';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'Solky Care',
  description: 'Cooperativa Sociale — Gestione presenze',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
