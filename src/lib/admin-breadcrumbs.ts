// Breadcrumbs for the viratmohan.com admin pages, derived from the route and from what the page actually loaded.
// Pure: no framework, no network. Rendered by src/components/AdminBreadcrumbs.astro.
export interface Crumb { label: string; href: string | null }

const ADMIN = '/retail-os/admin';
const ROOT: Crumb = { label: 'Command Centre', href: `${ADMIN}/console` };
const MAX_RESOURCE = 60;

interface PageDef { label: string; tabs?: Record<string, string>; defaultTab?: string }

const PAGES: Record<string, PageDef> = {
  [ADMIN]: { label: 'Applications' },
  [`${ADMIN}/control-tower`]: { label: 'Control Tower', defaultTab: 'board', tabs: { board: 'Morning Board', pipeline: 'Work Pipeline', agents: 'Agents', brands: 'Brands', ceo: 'Ask the CEO' } },
  [`${ADMIN}/org`]: { label: 'Org board', defaultTab: 'chart', tabs: { chart: 'Org chart', visual: 'Visualiser', planner: 'Daily planner', rights: 'Decision rights' } },
  [`${ADMIN}/leads`]: { label: 'Leads' },
  [`${ADMIN}/brands`]: { label: 'Brands' },
  [`${ADMIN}/reports`]: { label: 'Brand reports' },
  [`${ADMIN}/faq`]: { label: 'FAQ inbox' },
  [`${ADMIN}/invoices`]: { label: 'Invoices' },
  [`${ADMIN}/inbox`]: { label: 'WhatsApp inbox' },
  [`${ADMIN}/publish`]: { label: 'Publish to Instagram' },
};
const CONSOLE_TABS: Record<string, string> = { today: 'Command Centre', crm: 'CRM pipeline', team: 'Team & tasks', live: 'Live brands', brands: 'Brands & contacts', social: 'Social' };

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > MAX_RESOURCE ? `${t.slice(0, MAX_RESOURCE - 1)}…` : t) : null;
};

export interface BreadcrumbOptions {
  /** The active ?tab= value, if the page has tabs. An unknown value falls back to the page's default tab. */
  tab?: string | null;
  /** The real name of the record the page is about (for example a brand name). Omit it when the record was not found. */
  resource?: string | null;
}

/** The trail for an admin path. The last crumb is the current page and has no link. */
export function adminBreadcrumbs(pathname: string, opts: BreadcrumbOptions = {}): Crumb[] {
  const path = pathname.replace(/\/+$/, '') || '/';
  const resource = clean(opts.resource);

  // The Command Centre is the root; its own tabs hang off it.
  if (path === `${ADMIN}/console`) {
    const tab = opts.tab && CONSOLE_TABS[opts.tab] ? opts.tab : 'today';
    return tab === 'today'
      ? [{ label: ROOT.label, href: null }]
      : [{ label: ROOT.label, href: ROOT.href }, { label: CONSOLE_TABS[tab], href: null }];
  }

  const dynamic = path.match(new RegExp(`^${ADMIN}/(plan|design|media)/[^/]+$`));
  if (dynamic) {
    const kind = dynamic[1];
    const leaf = kind === 'plan' ? 'Business plan' : kind === 'design' ? 'Design direction' : 'Media assets';
    const parent: Crumb = kind === 'media' ? { label: 'Brands', href: `${ADMIN}/brands` } : { label: 'Applications', href: ADMIN };
    return [ROOT, parent, ...(resource ? [{ label: resource, href: null }] : []), { label: leaf, href: null }];
  }

  const page = PAGES[path];
  if (!page) return [{ label: ROOT.label, href: ROOT.href }, { label: path.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ?? 'Admin', href: null }];

  const trail: Crumb[] = [ROOT];
  const tabLabel = page.tabs && page.defaultTab ? (opts.tab && page.tabs[opts.tab] ? opts.tab : page.defaultTab) : null;
  const onDefault = !page.tabs || tabLabel === page.defaultTab;
  trail.push({ label: page.label, href: onDefault ? null : path });
  if (page.tabs && tabLabel && !onDefault) trail.push({ label: page.tabs[tabLabel], href: null });
  return trail;
}

/** True when the path has a real breadcrumb definition (a new admin page without one falls back to a generic trail). */
export function isKnownAdminPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === `${ADMIN}/console` || path in PAGES || new RegExp(`^${ADMIN}/(plan|design|media)/[^/]+$`).test(path);
}
