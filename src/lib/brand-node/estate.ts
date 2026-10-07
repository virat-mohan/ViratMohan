// The estate as typed data, read from the repositories and the control-plane registry on 2026-10-07.
// It is a map of what exists and how connected it is, not a second registry: the central registry is the
// brands table; each brand's configuration lives in its own repo. Every connection claim carries evidence,
// and tests/unit/brand-node/estate.test.ts refuses a claim without it. Unknown stays UNKNOWN with the reason.
import { link, type Link } from './states';
import type { Capability } from './adapter';

export type EstateClass = 'devshop-core' | 'retail-os-core' | 'retail-os-package' | 'retail-os-brand' | 'custom-build' | 'client-extension' | 'experiment' | 'archive';
export type EstateStatus = 'production' | 'active' | 'provisioning' | 'experimental' | 'archive';

export interface Connections { registry: Link; adapter: Link; agent: Link; work: Link; dashboard: Link; health: Link; crm: Link; growth: Link; finance: Link }
export interface EstateEntry {
  id: string; repo: string | null; system: string; brand: string | null; brandKey: string | null;
  class: EstateClass; status: EstateStatus; stack: string; production: 'yes' | 'no' | 'unknown';
  owner: string; database: string; deployment: string; domain: string;
  connections: Connections | null;          // only brand operating nodes have connections
  unique: string[];                          // capabilities no other brand has
  notes: string[];
}

const CP = 'live:control-plane brands row (Supabase vszjwgxvqoqyixpfthwl, read-only query 2026-10-07)';
const PORTFOLIO = 'src/lib/retail-os-portfolio.ts (brandMetrics, channelMix, brandBudget, checkBrandConnection)';
const REGISTERED = 'whether the brand is in the production RETAIL_OS_LIVE_BRANDS env var is not visible from any repository';

export const ESTATE: EstateEntry[] = [
  {
    id: 'viratmohan', repo: 'ViratMohan', system: 'DevShop control plane and viratmohan.com', brand: 'DevShop', brandKey: null,
    class: 'devshop-core', status: 'production', stack: 'Astro, Supabase', production: 'yes', owner: 'DS-02 Dev (DS-00 Virat approves)',
    database: 'Supabase vszjwgxvqoqyixpfthwl', deployment: 'Vercel', domain: 'viratmohan.com', connections: null,
    unique: ['Brand registry (brands table)', 'Work Registry', 'CEO and agent contracts', 'Control Tower', 'Lead journey, NDA and deposit flow', 'Founder console and portfolio metrics', 'Model governance (intelligence/)'],
    notes: ['Hosts retail-os-brands/freshforpaws (staged) and starters/next-brand-plane (older starter, see retail-os-starter-b)'],
  },
  {
    id: 'brand-config', repo: 'retail-os-brand-config', system: '@retail-os/brand-config contract package and the hardened starter', brand: 'Retail OS', brandKey: null,
    class: 'retail-os-package', status: 'active', stack: 'TypeScript package (dist committed), Next.js starter', production: 'unknown', owner: 'DS-02 Dev',
    database: 'none', deployment: 'consumed by git SHA pin (private)', domain: 'n/a', connections: null,
    unique: ['29-module registry', 'Brand Foundation, Memory and identity contracts', 'admin gate and login throttle', 'dashboard-sections (11 canonical sections)'],
    notes: ['No adapter, health, metrics, provisioning or onboarding contract existed in it before brand-node (audit 2026-10-07)', 'v0.3.0 is unreleased: branch claude/brand-plane-contract'],
  },
  {
    id: 'retail-os-starter-b', repo: 'ViratMohan', system: 'starters/next-brand-plane (older, dashboard-only starter)', brand: 'Retail OS', brandKey: null,
    class: 'retail-os-core', status: 'active', stack: 'Next.js 14, Vitest', production: 'no', owner: 'DS-02 Dev',
    database: 'none', deployment: 'none', domain: 'n/a', connections: null, unique: [],
    notes: ['LEGACY / ARCHIVE CANDIDATE: duplicates starters/next-brand-plane in retail-os-brand-config, which ESTATE section 14 names as the starter', 'Kept because the ViratMohan release gate typechecks it. Consolidation is a decision for Virat, not made here'],
  },
  {
    id: 'moonglasses', repo: 'moon-glasses', system: 'Moonglasses Retail OS store and admin', brand: 'Moonglasses', brandKey: 'moonglasses',
    class: 'retail-os-brand', status: 'production', stack: 'Next.js 16, Supabase', production: 'yes', owner: 'MG-01 Moon',
    database: 'Supabase moon-glasses (ref fewnyteoprmuyzfvopnb), ACTIVE_HEALTHY; live: project list read 2026-10-07', deployment: 'Vercel (8 crons in vercel.json)', domain: 'moon-glasses.store',
    connections: {
      registry: link('LIVE', [CP + ' key=moonglasses status=live live_since=2026-10-02']),
      adapter: link('PARTIAL', [PORTFOLIO, 'src/lib/brand-node/adapter.ts'], REGISTERED),
      agent: link('PARTIAL', ['src/lib/ceo/types.ts AGENT_REGISTRY MG-01 scope brand=moonglasses'], 'registry and routing exist in code and tests; the CEO runtime is not live'),
      work: link('PARTIAL', ['src/lib/work (complete, tested)'], 'Work Registry is not wired to any live schedule and moon-glasses never calls it'),
      dashboard: link('PARTIAL', ['moon-glasses origin/canonical-dashboard-shell 4895444: 7 files, +508/-115, no page or route removed'], 'pushed, not merged; main has moved 34 commits since its base'),
      health: link('PARTIAL', ['scripts/health/check.mjs BRANDS.moonglasses (external pages and payment config checks)'], 'no health endpoint inside the repo'),
      crm: link('NOT_CONNECTED', [], 'customers, leads and loyalty exist in the brand; the control plane reads none of them (BrandMetrics.customers is unreported)'),
      growth: link('PARTIAL', [PORTFOLIO], REGISTERED),
      finance: link('PARTIAL', [PORTFOLIO], REGISTERED),
    },
    unique: ['creators (apply, agreement, scoring)', 'virtual try-on and AI model photos', '35-item dynamic catalogue cart', 'Pay With A Post', 'WhatsApp catalogue checkout', 'bank-mail UPI matching', 'ad agent'],
    notes: ['COD off (COD_DISABLED), card off, UPI on: lib/order-pricing.ts, api/checkout/config', 'Local branch claude/moon-foundation-proof pins a different package SHA (2c6054d) than the shell branch (955bacb)'],
  },
  {
    id: 'caps', repo: 'Travaholic_caps', system: 'Travaholic Caps Retail OS store and admin', brand: 'Travaholic Caps', brandKey: 'caps',
    class: 'retail-os-brand', status: 'production', stack: 'Next.js 16, Supabase', production: 'yes', owner: 'TC-01 Trav',
    database: 'Supabase Travaholic Caps (ref mdornfpcskvjnuawqpqf), ACTIVE_HEALTHY; live: project list read 2026-10-07', deployment: 'Vercel (11 crons in vercel.json)', domain: 'travaholic.in',
    connections: {
      registry: link('LIVE', [CP + ' key=caps status=live']),
      adapter: link('PARTIAL', [PORTFOLIO, 'src/lib/brand-node/adapter.ts'], REGISTERED),
      agent: link('PARTIAL', ['src/lib/ceo/types.ts AGENT_REGISTRY TC-01 scope brand=caps', 'Travaholic_caps CLAUDE.md CEO agent charter 1 Oct 2026'], 'charter is prose; the CEO runtime is not live'),
      work: link('PARTIAL', ['src/lib/work (complete, tested)'], 'not wired to a live schedule; Travaholic_caps never calls it'),
      dashboard: link('PARTIAL', ['Travaholic_caps origin/canonical-dashboard-shell 3c26476: 8 files, +432/-80, no page removed'], 'pushed, not merged. origin/main reverted the Brand Foundation change it builds on (7356b0e, 2026-10-05), so merging needs a decision'),
      health: link('PARTIAL', ['scripts/health/check.mjs BRANDS.travaholic (pages only)'], 'no health endpoint inside the repo'),
      crm: link('NOT_CONNECTED', [], 'customers, leads and Miles loyalty exist in the brand; the control plane reads none of them'),
      growth: link('PARTIAL', [PORTFOLIO], REGISTERED),
      finance: link('PARTIAL', [PORTFOLIO], REGISTERED),
    },
    unique: ['Miles loyalty', 'performance manager (ROAS target and caps)', 'checkout-health alerting', 'Shiprocket NDR/RTO flows', 'story series catalogue', 'brand voice guard on every send'],
    notes: ['Server still accepts cod_advance although COD is off in the UI: owner decision pending (create-order/route.ts)', 'Package pin: main 2c6054d, shell branch 955bacb'],
  },
  {
    id: 'ceremonykitchen', repo: 'ceremony-os', system: 'Ceremony Kitchen Retail OS client app with client-specific extensions', brand: 'Ceremony Kitchen', brandKey: 'ceremonykitchen',
    class: 'client-extension', status: 'production', stack: 'Next.js 16, Supabase', production: 'unknown', owner: 'CK-01 Cera',
    database: 'Supabase ceremony-os (ref jnfapkxpkdizwjzrccjm), ACTIVE_HEALTHY; live: project list read 2026-10-07', deployment: 'Vercel, served under viratmohan.com/devshop/ceremonykitchen (6 crons)', domain: 'www.viratmohan.com/devshop/ceremonykitchen',
    connections: {
      registry: link('LIVE', [CP + ' key=ceremonykitchen status=live model=retainer']),
      adapter: link('CONTRACT_ONLY', ['ceremony-os README: register with RETAIL_OS_LIVE_BRANDS'], 'the portfolio reader queries orders; ceremony-os has shopify_orders, so the shape mapping is unverified and no adapter exists'),
      agent: link('PARTIAL', ['src/lib/ceo/types.ts AGENT_REGISTRY CK-01 scope brand=ceremonykitchen'], 'the CEO runtime is not live; the scope key now matches the registry (it was "ceremony" and the Work Registry would have refused it)'),
      work: link('NOT_CONNECTED', [], 'ceremony-os never calls the control plane; CLAUDE.md names it as prose only'),
      dashboard: link('NOT_CONNECTED', ['ceremony-os app/admin/(panel)/layout.tsx (hard-coded nav, 20 pages)'], 'own working shell; not the canonical 11-section shell and no package dependency. Preserved as is'),
      health: link('NOT_CONNECTED', ['scripts/health/check.mjs BRANDS.ceremony checks "/" only'], 'no /api/health in the repo'),
      crm: link('NOT_CONNECTED', [], 'no leads or CRM tables in ceremony-os (audit 2026-10-07)'),
      growth: link('NOT_CONNECTED', [], 'meta_ad_insights, attribution and MIS exist in the brand but are not read by the control plane'),
      finance: link('NOT_CONNECTED', [], 'Ceremony Finance (bills, payment runs, imprest) is a client-specific extension; not read by the control plane'),
    },
    unique: ['Inventory Master with recipes/BOM and stock movements', 'vendors and purchasing', 'Ceremony Finance (payment requests, runs, petty cash)', 'approval alerts over WhatsApp', 'per-user RBAC with 12 permissions', 'kitchen production sheet', 'proposals and B2B catalogue terms'],
    notes: ['Single commit in history; production status is inferred from crons and docs, not proven', 'Only 2 test files and no typecheck script', 'Extract only: approval-alerts core, write-guard, permission pattern. Everything else stays here'],
  },
  {
    id: 'korbi', repo: 'korbi', system: 'KORBI Retail OS admin', brand: 'KORBI (Ankay Holdings)', brandKey: 'korbi',
    class: 'retail-os-brand', status: 'active', stack: 'Astro, Supabase, Shopify read-only sync', production: 'unknown', owner: 'KB-01 Kor',
    database: 'Supabase korbi (ref dajglwnvrhrxryzjkjka), ACTIVE_HEALTHY; live: project list read 2026-10-07', deployment: 'Vercel', domain: 'UNKNOWN: not in the repository',
    connections: {
      registry: link('LIVE', [CP + ' key=korbi status=building']),
      adapter: link('UNKNOWN', [], 'korbi has a 0001_retail_os_core.sql migration; whether it exposes the orders table the portfolio reader needs was not verified'),
      agent: link('PARTIAL', ['src/lib/ceo/types.ts AGENT_REGISTRY KB-01 scope brand=korbi'], 'CEO runtime is not live'),
      work: link('NOT_CONNECTED', [], 'korbi never calls the control plane; CLAUDE.md names it as prose only'),
      dashboard: link('NOT_CONNECTED', ['korbi src/pages/admin (Command Centre, Orders, Products, Media, Integrations)'], 'own Astro admin; no package dependency and no canonical-section nav'),
      health: link('NOT_CONNECTED', [], 'no health endpoint; not in scripts/health/check.mjs'),
      crm: link('NOT_CONNECTED', [], 'no CRM module in korbi'),
      growth: link('NOT_CONNECTED', [], 'only utm_source in src/lib/metrics.ts'),
      finance: link('PARTIAL', ['korbi src/lib/metrics.ts (Rs 1,000 per online unit fee)'], 'fee arithmetic only; not read by the control plane'),
    },
    unique: ['Rs 1,000 per online unit fee deal', 'encrypted Shopify token (crypto.ts)', 'heavy-product shipping decision (not recorded in the repo)'],
    notes: ['DRIFT: ESTATE.md says Retail OS Live; the registry says building; the repo shows no confirmed production deploy. Treated as active, production unknown'],
  },
  {
    id: 'freshforpaws', repo: null, system: 'Fresh For Paws Retail OS backend (staged) behind a WooCommerce store', brand: 'Fresh For Paws', brandKey: 'freshforpaws',
    class: 'retail-os-brand', status: 'provisioning', stack: 'Supabase SQL and Edge Functions (Deno); future Next.js brand plane', production: 'no', owner: 'FP-01 Paws',
    database: 'Supabase freshforpaws-os (ref ksstmmmdvdpeygfzothu), ACTIVE_HEALTHY, created 2026-10-05; 11 tables with RLS on', deployment: 'two Supabase Edge Functions deployed (woo-webhook, woo-sync, v4); no Vercel brand plane yet', domain: 'freshforpaws.com (WooCommerce, owned by the brand)',
    connections: {
      registry: link('LIVE', [CP + ' key=freshforpaws status=building has_application=true has_lead=true']),
      adapter: link('PARTIAL', ['live:Supabase ksstmmmdvdpeygfzothu: orders, customers, products tables with the standard names, RLS on (read-only query 2026-10-07)', 'retail-os-brands/freshforpaws/supabase/migrations/0001_retail_os_core.sql', 'src/lib/brand-node/node.ts createBrandNode factory (bound when RETAIL_OS_BRAND_FRESHFORPAWS credentials present)'], 'database exists with matching schema; BrandNode factory creates a node; health and metrics ports bind once credentials are set in the control-plane Vercel env — RETAIL_OS_BRAND_FRESHFORPAWS_NAME, _URL and _SERVICE_KEY'),
      agent: link('PARTIAL', ['src/lib/ceo/types.ts AGENT_REGISTRY FP-01 scope brand=freshforpaws', 'src/lib/brand-node/brand-ceo-context.ts bindBrandCeo()'], 'FP-01 Paws is registered and can receive Work items; operational binding (health/KPI reads) activates when credentials are set'),
      work: link('PARTIAL', ['src/lib/work (complete, tested)', 'src/lib/brand-node/provisioning-service.ts syncProvisioningToWork()', 'tests/unit/ceo-integration/ceo-work-result.test.ts tests D-F prove freshforpaws is a valid brand scope'], 'Work Registry code is in place; scope accepted in tests; not yet wired to live registry rows from control plane'),
      dashboard: link('SETUP_REQUIRED', ['retail-os-brands/freshforpaws/BRAND-BOOK.md', 'public/preview/freshforpaws (three website mockups)', 'src/lib/brand-node/dashboard-data.ts buildDashboardData()'], 'dashboard data layer is built; a Next.js brand plane needs a GitHub repo and Vercel project (ops task: founder creates them)'),
      health: link('PARTIAL', ['live:woo_sync_state orders last_result ok=true at 2026-10-07 19:00 UTC (hourly sync running)', 'src/lib/brand-node/adapter.ts readHealth() returns DATABASE component when health port is bound'], 'health contract is built; DATABASE component will report when credentials are set; woo-sync running proves the database connection works'),
      crm: link('PARTIAL', ['live:customers table populated by the Woo sync (2 rows)', 'live:orders table 2 rows; order_items populated'], 'data exists in the brand database; control-plane reads it once credentials are registered'),
      growth: link('SETUP_REQUIRED', ['migrations/0001 tracking_events (empty)'], 'Meta, GA4 and Search Console partner access from the founder is outstanding'),
      finance: link('SETUP_REQUIRED', ['migrations/0001 weekly_statements and compute_weekly_statement()', 'live:app_settings holds the agreed split keys (7 keys)'], 'cost per pack, pack size and shelf life are empty on all 27 products and no expenses are recorded, so a weekly statement cannot yet be computed; Razorpay view access outstanding'),
    },
    unique: ['WooCommerce webhook and sync connector (reusable for any WooCommerce brand)', 'weekly statement with the agreed 25/25/10/40 split', 'cold-chain delivery zones (to come)', 'subscription meal plans'],
    notes: [
      'Not "not started": schema, two Edge Functions, a Woo connector, a brand voice checker, a brand book, three website mockups, 14 ops tasks, an application and a lead all exist',
      'LIVE FINDING 2026-10-07: the Supabase project freshforpaws-os exists (created 2026-10-05), the staged schema is applied (11 tables, RLS on, applied by hand so the migration ledger is empty), woo-webhook and woo-sync are deployed (v4), and an hourly sync is running (last run ok, 27 products, 2 orders, none COD)',
      'STALE DOCS: README connection checklist row 1 ("Blocked: project creation timed out") and ESTATE.md section 7 ("no Supabase project, no edge functions live") are out of date; so is the ops board, which still lists "Deploy edge functions" as pending',
      'Still missing: 0 of 27 products have cost, pack size or shelf life; no GitHub repo or Vercel project; not registered in the control plane portfolio reader; the Fresh brand-voice test is not run by npm test or the release gate',
    ],
  },
  {
    id: 'thefeelingco', repo: 'thefeelingco', system: 'The Feeling Co static site and Flower Basket subscription app', brand: 'The Feeling Co / FlowerBasket', brandKey: 'thefeelingco',
    class: 'custom-build', status: 'active', stack: 'static HTML, Next.js 16 app with mock data', production: 'unknown', owner: 'DS-02 Dev',
    database: 'none: the app uses mock data and mock payments', deployment: 'Vercel, two projects (site and flowerbasket app)', domain: 'thefeelingco.online',
    connections: {
      registry: link('LIVE', [CP + ' key=thefeelingco status=live']),
      adapter: link('NOT_CONNECTED', [], 'no database to read'),
      agent: link('NOT_CONNECTED', [], 'no Brand CEO is registered for this brand'),
      work: link('NOT_CONNECTED', [], 'no connection'),
      dashboard: link('NOT_CONNECTED', ['thefeelingco app/src admin (catalogue, payments, reports)'], 'own admin on mock data'),
      health: link('NOT_CONNECTED', [], 'no health endpoint'),
      crm: link('NOT_CONNECTED', [], 'accounts and referrals are mock'),
      growth: link('NOT_CONNECTED', [], 'vouchers and referrals are mock'),
      finance: link('NOT_CONNECTED', [], 'payments are mock'),
    },
    unique: ['subscription flowers with tiers, zones, vouchers and referrals', 'delivery operations board'],
    notes: ['DRIFT: the registry says live and ESTATE.md says implementation to confirm. app/PRODUCTION_READINESS_AUDIT.md says the Flower Basket app is not production ready', 'Classification custom-build is proposed from the repo evidence; ESTATE.md leaves it to confirm with Virat'],
  },
  { id: 'indiacontemporary', repo: 'indiacontemporary.net', system: 'India Contemporary art marketplace storefront', brand: 'India Contemporary', brandKey: 'indiacontemporary', class: 'archive', status: 'archive', stack: 'Vite, React, Vercel functions, mock data', production: 'unknown', owner: 'DS-02 Dev', database: 'Supabase indiacontemporary.net (ref smzfdqwgaxwdxkiuqftc), INACTIVE (paused); live: project list read 2026-10-07', deployment: 'Vercel SPA', domain: 'indiacontemporary.net', connections: null, unique: ['artist onboarding', 'sold-works archive'], notes: ['Passive client; marketplace pattern kept as reusable IP (ESTATE section 9)'] },
  { id: 'travaholic-stays', repo: 'Travaholic', system: 'Travaholic Stays villa marketplace (legacy)', brand: 'Travaholic Stays', brandKey: null, class: 'archive', status: 'archive', stack: 'React CRA, FastAPI', production: 'unknown', owner: 'DS-02 Dev', database: 'UNKNOWN: not confirmed in the repo', deployment: 'Render (render.yaml)', domain: 'UNKNOWN', connections: null, unique: ['date-range booking', 'commission and owner payout ledger', 'PDF generation'], notes: ['Passive/legacy client. Real estate marketplace architecture is reusable future-vertical IP; do not reactivate the client to reuse it'] },
  { id: 'content-ment', repo: 'Content-ment', system: 'Content review app (purpose undocumented)', brand: null, brandKey: null, class: 'experiment', status: 'experimental', stack: 'Next.js, Prisma, PostgreSQL', production: 'unknown', owner: 'UNKNOWN', database: 'Prisma via DATABASE_URL', deployment: 'UNKNOWN', domain: 'UNKNOWN', connections: null, unique: [], notes: ['No README or CLAUDE.md; purpose to confirm with Virat'] },
  { id: 'coachyourpsyche', repo: 'Coachyourpsyche', system: 'Coach Your Psyche AI counselling app', brand: 'Coach Your Psyche', brandKey: null, class: 'experiment', status: 'experimental', stack: 'React CRA, FastAPI', production: 'unknown', owner: 'UNKNOWN', database: 'UNKNOWN: backend not inspected', deployment: 'UNKNOWN', domain: 'UNKNOWN', connections: null, unique: ['AI chat personas with a credit system'], notes: ['Dormant since 2026-07-10'] },
  { id: 'mystique', repo: 'Mystique', system: 'Mystique AI-curated art marketplace prototype', brand: 'Mystique', brandKey: null, class: 'experiment', status: 'experimental', stack: 'React, FastAPI, MongoDB, Stripe', production: 'no', owner: 'UNKNOWN', database: 'MongoDB', deployment: 'UNKNOWN', domain: 'UNKNOWN', connections: null, unique: ['AI room mockups'], notes: ['Dormant since 2026-07-10; no Claude Project mapped (ESTATE section 5)'] },
];

const L = (key: Capability['key'], state: Capability['state'], note = ''): Capability => ({ key, state, note });
/** What each brand has today, from the repository audits. Nothing here is enabled or removed by this file. */
export const BRAND_CAPABILITIES: Record<string, Capability[]> = {
  moonglasses: [L('catalogue', 'LIVE'), L('commerce', 'LIVE', 'UPI only'), L('customers', 'LIVE'), L('crm', 'LIVE', 'leads, loyalty, WhatsApp inbox'), L('inventory', 'LIVE', 'Inventory Master is a client extension'), L('finance', 'LIVE', 'P&L, expenses'), L('growth', 'LIVE'), L('operations', 'LIVE', 'Shiprocket, returns'), L('concierge', 'LIVE', 'WhatsApp'), L('creator', 'LIVE'), L('client_extensions', 'CLIENT_SPECIFIC', 'try-on, AI model photos')],
  caps: [L('catalogue', 'LIVE'), L('commerce', 'LIVE', 'UPI and Razorpay prepaid'), L('customers', 'LIVE'), L('crm', 'LIVE', 'leads, Miles loyalty'), L('inventory', 'LIVE'), L('finance', 'LIVE'), L('growth', 'LIVE'), L('operations', 'LIVE', 'Shiprocket, NDR/RTO'), L('concierge', 'LIVE', 'WhatsApp inbox'), L('creator', 'AVAILABLE', 'Pay With A Post only; no creator application module'), L('client_extensions', 'CLIENT_SPECIFIC', 'Miles, story series')],
  ceremonykitchen: [L('catalogue', 'LIVE', 'catalog and proposals'), L('commerce', 'CLIENT_SPECIFIC', 'read-only Shopify sync, custom orders'), L('customers', 'AVAILABLE', 'no customer admin'), L('crm', 'AVAILABLE', 'no CRM module'), L('inventory', 'LIVE', 'full Inventory Master, recipes/BOM, stock movements'), L('finance', 'CLIENT_SPECIFIC', 'Ceremony Finance'), L('growth', 'LIVE', 'ads, attribution, MIS'), L('operations', 'CLIENT_SPECIFIC', 'Ceremony Ops, kitchen, SOPs'), L('concierge', 'AVAILABLE'), L('creator', 'AVAILABLE'), L('client_extensions', 'CLIENT_SPECIFIC', 'approvals, RBAC, proposals')],
  korbi: [L('catalogue', 'LIVE', 'admin products'), L('commerce', 'LIVE', 'orders via read-only Shopify sync'), L('customers', 'AVAILABLE'), L('crm', 'AVAILABLE'), L('inventory', 'AVAILABLE'), L('finance', 'AVAILABLE', 'fee arithmetic only'), L('growth', 'AVAILABLE'), L('operations', 'SETUP_REQUIRED', 'Shiprocket access to request'), L('concierge', 'DEFERRED', 'optional module; not part of the first 7 days'), L('creator', 'DEFERRED', 'optional module; not part of the first 7 days'), L('client_extensions', 'CLIENT_SPECIFIC', 'per-unit fee deal')],
  freshforpaws: [L('catalogue', 'SETUP_REQUIRED', '27 products synced from WooCommerce; cost, pack size and shelf life missing on all of them'), L('commerce', 'SETUP_REQUIRED', 'WooCommerce front stays; orders sync hourly (2 so far); Woo webhooks not confirmed'), L('customers', 'SETUP_REQUIRED', 'customers table is filled by the Woo sync (2 rows); no admin to use it yet'), L('crm', 'SETUP_REQUIRED', 'no CRM module is set up for this brand yet'), L('inventory', 'SETUP_REQUIRED', 'cost, pack size and shelf life are needed from the founder'), L('finance', 'SETUP_REQUIRED', 'weekly statement is written but needs product costs and recorded expenses'), L('growth', 'SETUP_REQUIRED', 'Meta, GA4 and Search Console access from the founder is outstanding'), L('operations', 'SETUP_REQUIRED', 'delivery zones, slots and cold chain are needed from the founder'), L('concierge', 'DEFERRED', 'WhatsApp number decision sits with the founder'), L('creator', 'DEFERRED', 'optional module; not part of the first 7 days'), L('client_extensions', 'CLIENT_SPECIFIC', 'WooCommerce front, cold-chain delivery, meal subscriptions')],
  thefeelingco: [L('catalogue', 'CLIENT_SPECIFIC', 'mock data'), L('commerce', 'SETUP_REQUIRED', 'mock payments'), L('customers', 'SETUP_REQUIRED', 'needs the brand database and accounts, which are not set up yet'), L('crm', 'SETUP_REQUIRED', 'needs the brand database and accounts, which are not set up yet'), L('inventory', 'DEFERRED', 'optional module; not part of the first 7 days'), L('finance', 'SETUP_REQUIRED', 'needs the brand database and accounts, which are not set up yet'), L('growth', 'CLIENT_SPECIFIC', 'vouchers, referrals'), L('operations', 'CLIENT_SPECIFIC', 'delivery board'), L('concierge', 'DEFERRED', 'optional module; not part of the first 7 days'), L('creator', 'DEFERRED', 'optional module; not part of the first 7 days'), L('client_extensions', 'CLIENT_SPECIFIC', 'subscriptions')],
};
