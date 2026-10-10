import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { identity } from '@/lib/brand';

export const metadata: Metadata = {
  title: `${identity.profile.brandName} — Retail OS`,
  description: identity.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
