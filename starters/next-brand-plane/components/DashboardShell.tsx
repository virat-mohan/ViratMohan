import type { ReactNode } from 'react';
import type { DashboardSectionView } from '@retail-os/brand-config/dashboard-sections';
import type { HeaderModel } from '@retail-os/brand-config/render-contract';
import { DashboardNav } from './DashboardNav';

interface DashboardShellProps {
  sections: DashboardSectionView[];
  header: HeaderModel;
  children: ReactNode;
}

export function DashboardShell({ sections, header, children }: DashboardShellProps) {
  return (
    <div
      className="dashboard-shell"
      style={{
        '--ds-bg': header.colors.bg,
        '--ds-ink': header.colors.ink,
        '--ds-gold': header.colors.gold,
        '--ds-secondary': header.colors.secondary,
        '--ds-font-display': header.fonts.display,
        '--ds-font-serif': header.fonts.serif,
        '--ds-font-sans': header.fonts.sans,
      } as React.CSSProperties}
    >
      <DashboardNav
        sections={sections}
        brandName={header.brandName}
        logoPath={header.logoPath}
        logoAlt={header.logoAlt}
      />
      <main className="dashboard-shell__main">
        {children}
      </main>
    </div>
  );
}
