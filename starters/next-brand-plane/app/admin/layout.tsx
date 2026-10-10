import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { getDashboardSections, getHeader } from '@/lib/dashboard';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const sections = getDashboardSections();
  const header = getHeader();

  return (
    <DashboardShell sections={sections} header={header}>
      {children}
    </DashboardShell>
  );
}
