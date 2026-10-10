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
  { id: '01', label: 'Company & Governance' },
  { id: '02', label: 'DevShop Core' },
  { id: '03', label: 'Platform & Shared Packages' },
  { id: '04', label: 'Owned Brands' },
  { id: '05', label: 'Client Brands' },
  { id: '07', label: 'Experiments & IP' },
  { id: '08', label: 'Passive / Legacy' },
  { id: '10', label: 'Public Web' },
];

export const REPO_ESTATE: RepoEntry[] = [
  {
    slug: 'ViratMohan', name: 'DevShop Control Plane', group: '03', groupLabel: 'Platform & Shared Packages',
    brand: null, framework: 'astro', database: 'Supabase', status: 'active_production', retailOsStatus: null,
    supabaseRef: 'vszjwgxvqoqyixpfthwl', deployment: 'viratmohan.com',
    notes: 'Master control for the whole DevShop Retail OS ecosystem',
  },
  {
    slug: 'retail-os-brand-config', name: 'Retail OS Brand Config', group: '03', groupLabel: 'Platform & Shared Packages',
    brand: null, framework: 'ts_package', database: null, status: 'active_production', retailOsStatus: null,
    supabaseRef: null, deployment: 'private (git SHA pin)',
    notes: 'Shared package: 29-module registry, identity contract, admin gate, starter',
  },
  {
    slug: 'moon-glasses', name: 'Moon Glasses', group: '04', groupLabel: 'Owned Brands',
    brand: 'moonglasses', framework: 'nextjs', database: 'Supabase', status: 'active_production', retailOsStatus: 'live',
    supabaseRef: null, deployment: 'Vercel (public)',
    notes: 'Owned brand — Retail OS Live',
  },
  {
    slug: 'Travaholic_caps', name: 'Travaholic Caps', group: '05', groupLabel: 'Client Brands',
    brand: 'caps', framework: 'nextjs', database: 'Supabase', status: 'active_production', retailOsStatus: 'live',
    supabaseRef: null, deployment: 'Vercel (public)',
    notes: 'Reference implementation for admin standard + Brand Foundation',
  },
  {
    slug: 'korbi', name: 'Korbi', group: '05', groupLabel: 'Client Brands',
    brand: 'korbi', framework: 'astro', database: null, status: 'active_production', retailOsStatus: 'live',
    supabaseRef: null, deployment: 'private',
    notes: 'KORBI / Ankay Holdings — Astro stays, no migration',
  },
  {
    slug: 'ceremony-os', name: 'Ceremony Kitchen', group: '05', groupLabel: 'Client Brands',
    brand: 'ceremonykitchen', framework: 'nextjs', database: 'Supabase', status: 'active_production', retailOsStatus: 'implementation',
    supabaseRef: null, deployment: 'viratmohan.com/devshop/ceremonykitchen (private)',
    notes: 'Ceremony Finance & Ops are client-specific extensions',
  },
  {
    slug: 'thefeelingco', name: 'The Feeling Co / FlowerBasket', group: '05', groupLabel: 'Client Brands',
    brand: null, framework: 'static_react', database: null, status: 'active_client', retailOsStatus: null,
    supabaseRef: null, deployment: 'private',
    notes: 'Implementation status to confirm with Virat',
  },
  {
    slug: 'indiacontemporary.net', name: 'India Contemporary', group: '08', groupLabel: 'Passive / Legacy',
    brand: null, framework: 'vite_react', database: 'Supabase', status: 'passive', retailOsStatus: 'legacy',
    supabaseRef: null, deployment: 'public',
    notes: 'Passive client — keep for IP',
  },
  {
    slug: 'Travaholic', name: 'Travaholic Stays', group: '08', groupLabel: 'Passive / Legacy',
    brand: null, framework: 'python_react', database: null, status: 'passive', retailOsStatus: 'legacy',
    supabaseRef: null, deployment: 'public',
    notes: 'Real estate marketplace — reusable IP',
  },
  {
    slug: 'Content-ment', name: 'Content-ment', group: '07', groupLabel: 'Experiments & IP',
    brand: null, framework: 'nextjs_prisma', database: 'Prisma DB', status: 'experiment', retailOsStatus: null,
    supabaseRef: null, deployment: 'public',
    notes: 'Content/marketing-ops SaaS prototype — reusable IP',
  },
  {
    slug: 'Coachyourpsyche', name: 'Coach Your Psyche', group: '07', groupLabel: 'Experiments & IP',
    brand: null, framework: 'emergent', database: null, status: 'dormant', retailOsStatus: null,
    supabaseRef: null, deployment: 'private',
    notes: 'Dormant experiment',
  },
  {
    slug: 'Mystique', name: 'Mystique', group: '07', groupLabel: 'Experiments & IP',
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
