'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { DashboardSectionView } from '@retail-os/brand-config/dashboard-sections';

interface DashboardNavProps {
  sections: DashboardSectionView[];
  brandName: string;
  logoPath: string;
  logoAlt: string;
}

export function DashboardNav({ sections, brandName, logoPath, logoAlt }: DashboardNavProps) {
  const pathname = usePathname();
  const visible = sections.filter((s) => s.visible);

  return (
    <nav className="dashboard-nav" aria-label="Dashboard navigation">
      <div className="dashboard-nav__header">
        <img src={logoPath} alt={logoAlt} className="dashboard-nav__logo" width={32} height={32} />
        <span className="dashboard-nav__brand">{brandName}</span>
      </div>
      <ul className="dashboard-nav__sections">
        {visible.map((section) => {
          const active = pathname === section.path || pathname.startsWith(section.path + '/');
          return (
            <li key={section.section} className="dashboard-nav__section">
              <Link
                href={section.path}
                className={`dashboard-nav__link ${active ? 'dashboard-nav__link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {section.label}
                {section.items.length > 0 && (
                  <span className="dashboard-nav__count">{section.items.filter((i) => i.state === 'live').length}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
