// Static registry of the DevShop repository estate.
// Source of truth: case-study/ESTATE.md §5.
// Pure data — no network, no database, no framework imports.

export type RepoStatus = 'active_production' | 'active_client' | 'experiment' | 'passive' | 'dormant';
export type RetailOsStatus = 'live' | 'implementation' | 'provisioning' | 'staged' | 'legacy' | null;
export type Framework = 'astro' | 'nextjs' | 'vite_react' | 'python_react' | 'nextjs_prisma' | 'static_react' | 'emergent' | 'ts_package';

export interface RepoEntry {
  slug: string;
  name: string;
  group: string;
  groupLabel: string;
  brand: string | null;
  framework: Framework;
  database: string | null;
  status: RepoStatus;
  retailOsStatus: RetailOsStatus;
  supabaseRef: string | null;
  deployment: string | null;
  notes: string;
}

export const ESTATE_GROUPS: { id: string; label: string }[] = [
  { id: 'platform', label: 'DevShop Platform' },
  { id: 'live', label: 'Live Brands' },
  { id: 'building', label: 'Building' },
  { id: 'passive', label: 'Archive' },
  { id: 'experiments', label: 'Lab' },
];

export const REPO_ESTATE: RepoEntry[] = [
  // ── Platform & Infrastructure ─────────────────────────────────────────
  {
    slug: 'ViratMohan', name: 'DevShop HQ', group: 'platform', groupLabel: 'DevShop Platform',
    brand: null, framework: 'astro', database: 'Supabase', status: 'active_production', retailOsStatus: null,
    supabaseRef: 'vszjwgxvqoqyixpfthwl', deployment: 'viratmohan.com',
    notes: 'Master control for the whole DevShop Retail OS ecosystem',
  },
  {
    slug: 'retail-os-brand-config', name: 'Retail OS Kit', group: 'platform', groupLabel: 'DevShop Platform',
    brand: null, framework: 'ts_package', database: null, status: 'active_production', retailOsStatus: null,
    supabaseRef: null, deployment: 'private (git SHA pin)',
    notes: '29-module registry, identity contract, admin gate, Next.js starter',
  },

  // ── Retail OS Live Brands (taking real orders) ────────────────────────
  {
    slug: 'moon-glasses', name: 'Moon Glasses', group: 'live', groupLabel: 'Live Brands',
    brand: 'moonglasses', framework: 'nextjs', database: 'Supabase', status: 'active_production', retailOsStatus: 'live',
    supabaseRef: null, deployment: 'Vercel (public)',
    notes: 'Owned brand — Retail OS Live',
  },
  {
    slug: 'Travaholic_caps', name: 'Travaholic Caps', group: 'live', groupLabel: 'Live Brands',
    brand: 'caps', framework: 'nextjs', database: 'Supabase', status: 'active_production', retailOsStatus: 'live',
    supabaseRef: null, deployment: 'Vercel (public)',
    notes: 'Reference implementation for admin standard + Brand Foundation',
  },
  {
    slug: 'korbi', name: 'Korbi', group: 'live', groupLabel: 'Live Brands',
    brand: 'korbi', framework: 'astro', database: null, status: 'active_production', retailOsStatus: 'live',
    supabaseRef: null, deployment: 'private',
    notes: 'KORBI / Ankay Holdings — Astro, no migration planned',
  },

  // ── Brands in Progress (implementation / provisioning) ────────────────
  {
    slug: 'ceremony-os', name: 'Ceremony Kitchen', group: 'building', groupLabel: 'Building',
    brand: 'ceremonykitchen', framework: 'nextjs', database: 'Supabase', status: 'active_production', retailOsStatus: 'implementation',
    supabaseRef: null, deployment: 'viratmohan.com/devshop/ceremonykitchen (private)',
    notes: 'Ceremony Finance & Ops are client-specific extensions',
  },
  {
    slug: 'thefeelingco', name: 'The Feeling Co', group: 'building', groupLabel: 'Brands in Progress',
    brand: null, framework: 'static_react', database: null, status: 'active_client', retailOsStatus: null,
    supabaseRef: null, deployment: 'private',
    notes: 'FlowerBasket vendor outreach — implementation status to confirm',
  },

  // ── Archive ───────────────────────────────────────────────────────────
  {
    slug: 'indiacontemporary.net', name: 'India Contemporary', group: 'passive', groupLabel: 'Archive',
    brand: null, framework: 'vite_react', database: 'Supabase', status: 'passive', retailOsStatus: 'legacy',
    supabaseRef: null, deployment: 'public',
    notes: 'Passive client — keep for IP',
  },
  {
    slug: 'Travaholic', name: 'Travaholic Stays', group: 'passive', groupLabel: 'Archive',
    brand: null, framework: 'python_react', database: null, status: 'passive', retailOsStatus: 'legacy',
    supabaseRef: null, deployment: 'public',
    notes: 'Real estate marketplace — reusable IP',
  },

  // ── Lab ────────────────────────────────────────────────────────────────
  {
    slug: 'Content-ment', name: 'Content-ment', group: 'experiments', groupLabel: 'Lab',
    brand: null, framework: 'nextjs_prisma', database: 'Prisma DB', status: 'experiment', retailOsStatus: null,
    supabaseRef: null, deployment: 'public',
    notes: 'Content/marketing-ops SaaS prototype — reusable IP',
  },
  {
    slug: 'Coachyourpsyche', name: 'Coach Your Psyche', group: 'experiments', groupLabel: 'Lab',
    brand: null, framework: 'emergent', database: null, status: 'dormant', retailOsStatus: null,
    supabaseRef: null, deployment: 'private',
    notes: 'Dormant experiment',
  },
  {
    slug: 'Mystique', name: 'Mystique', group: 'experiments', groupLabel: 'Lab',
    brand: null, framework: 'emergent', database: null, status: 'dormant', retailOsStatus: null,
    supabaseRef: null, deployment: 'private',
    notes: 'Dormant — no Claude Project mapped',
  },
];

export interface ClientEntry {
  brand: string;
  brandKey: string;
  commercial: string;
  technical: string;
  repo: string | null;
  brandCeoId: string;
  brandCeoName: string;
}

export const ACTIVE_CLIENTS: ClientEntry[] = [
  { brand: 'Moon Glasses', brandKey: 'moonglasses', commercial: 'Owned brand', technical: 'Retail OS Live', repo: 'moon-glasses', brandCeoId: 'MG-01', brandCeoName: 'Moon' },
  { brand: 'Travaholic Caps', brandKey: 'caps', commercial: 'Paid Active', technical: 'Retail OS Live', repo: 'Travaholic_caps', brandCeoId: 'TC-01', brandCeoName: 'Trav' },
  { brand: 'Korbi', brandKey: 'korbi', commercial: 'Paid Active', technical: 'Retail OS Live', repo: 'korbi', brandCeoId: 'KB-01', brandCeoName: 'Kor' },
  { brand: 'Ceremony Kitchen', brandKey: 'ceremonykitchen', commercial: 'Paid Active', technical: 'Implementation Active', repo: 'ceremony-os', brandCeoId: 'CK-01', brandCeoName: 'Cera' },
  { brand: 'Fresh For Paws', brandKey: 'freshforpaws', commercial: 'Paid Active', technical: 'Provisioning', repo: null, brandCeoId: 'FP-01', brandCeoName: 'Paws' },
];

export function reposByGroup(): Map<string, RepoEntry[]> {
  const m = new Map<string, RepoEntry[]>();
  for (const g of ESTATE_GROUPS) m.set(g.id, []);
  for (const r of REPO_ESTATE) {
    const list = m.get(r.group) ?? [];
    list.push(r);
    m.set(r.group, list);
  }
  return m;
}

export function repoForBrand(brandKey: string): RepoEntry | undefined {
  return REPO_ESTATE.find(r => r.brand === brandKey);
}

export function liveRepos(): RepoEntry[] {
  return REPO_ESTATE.filter(r => r.retailOsStatus === 'live');
}

export function activeRepos(): RepoEntry[] {
  return REPO_ESTATE.filter(r => r.status === 'active_production' || r.status === 'active_client');
}

export const STATUS_LABEL: Record<RepoStatus, string> = {
  active_production: 'Active',
  active_client: 'Active',
  experiment: 'Experiment',
  passive: 'Passive',
  dormant: 'Dormant',
};

export const RETAIL_OS_STATUS_LABEL: Record<string, string> = {
  live: 'Retail OS Live',
  implementation: 'Implementation',
  provisioning: 'Provisioning',
  staged: 'Staged',
  legacy: 'Legacy',
};

export const FRAMEWORK_LABEL: Record<Framework, string> = {
  astro: 'Astro',
  nextjs: 'Next.js',
  vite_react: 'Vite + React',
  python_react: 'Python + React',
  nextjs_prisma: 'Next.js + Prisma',
  static_react: 'Static + React',
  emergent: 'Emergent',
  ts_package: 'TS Package',
};
