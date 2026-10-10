'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { DashboardSectionView } from '@retail-os/brand-config/dashboard-sections';

interface BreadcrumbsProps {
  sections: DashboardSectionView[];
  brandName: string;
  basePath?: string;
}

interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ sections, brandName, basePath = '/admin' }: BreadcrumbsProps) {
  const pathname = usePathname();
  const crumbs: Crumb[] = [];

  crumbs.push({ label: brandName, href: basePath });

  const activeSection = sections.find(
    (s) => s.visible && (pathname === s.path || pathname.startsWith(s.path + '/')),
  );

  if (activeSection) {
    const isDeep = pathname !== activeSection.path;
    crumbs.push(
      isDeep
        ? { label: activeSection.label, href: activeSection.path }
        : { label: activeSection.label },
    );

    if (isDeep) {
      const tail = pathname.slice(activeSection.path.length + 1).split('/').filter(Boolean);
      if (tail.length > 0) {
        const pageLabel = tail[tail.length - 1]
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        crumbs.push({ label: pageLabel });
      }
    }
  }

  if (crumbs.length <= 1) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={i} className="breadcrumbs__item">
          {i > 0 && <span className="breadcrumbs__sep" aria-hidden="true">›</span>}
          {crumb.href ? (
            <Link href={crumb.href} className="breadcrumbs__link">{crumb.label}</Link>
          ) : (
            <span className="breadcrumbs__current" aria-current="page">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
