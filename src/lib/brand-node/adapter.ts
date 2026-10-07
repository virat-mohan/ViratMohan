// The brand runtime adapter: what the control plane may ask of a brand, as small capability ports.
// A brand implements only the ports it really has; a missing port means "not connected", never a guess.
// Brands keep their own internals. Adapters translate; they do not force identical tables or code.
import { fullHealth, type HealthComponent, type HealthComponentName, type HealthState } from './states';

export type BrandStatus = 'lead' | 'building' | 'live' | 'paused' | 'ended';
export type FoundationStatus = 'draft' | 'review' | 'approved' | 'committed' | 'superseded' | 'none';

export interface BrandIdentity {
  brandId: string;            // the brands.key in the central registry
  clientId: string | null;
  name: string;
  status: BrandStatus;
  owner: string;              // accountable agent id (the Brand CEO), or a person when none exists yet
  domain: string | null;
  foundation: FoundationStatus | 'UNKNOWN';
}

export type CapabilityState = 'LIVE' | 'AVAILABLE' | 'SETUP_REQUIRED' | 'COMMERCIAL' | 'CLIENT_SPECIFIC' | 'DEFERRED';
export const CAPABILITY_KEYS = [
  'catalogue', 'commerce', 'customers', 'crm', 'inventory', 'finance', 'growth', 'operations', 'concierge', 'creator', 'client_extensions',
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export interface Capability { key: CapabilityKey; state: CapabilityState; note: string }

/** Null means unknown. A metric is never invented or defaulted to zero. */
export interface BrandMetrics {
  source: string;
  revenue: number | null;          // net sales, INR
  orders: number | null;
  customers: number | null;
  newCustomers: number | null;
  returningCustomers: number | null;
  repeatCustomerRate: number | null;
  adSpend: number | null;
  roas: number | null;
  contribution: number | null;     // only when costs are verified
  stock: number | null;
}
export const NO_METRICS = (source: string): BrandMetrics => ({
  source, revenue: null, orders: null, customers: null, newCustomers: null, returningCustomers: null, repeatCustomerRate: null, adSpend: null, roas: null, contribution: null, stock: null,
});

export interface WorkSummary { open: number; blocked: number; waiting: number; approval: number; incident: number; owner: string }

export interface IdentityPort { identity(): BrandIdentity }
export interface CapabilitiesPort { capabilities(): Capability[] }
export interface HealthPort { health(): Promise<HealthComponent[]> }
export interface MetricsPort { metrics(): Promise<BrandMetrics> }
export interface WorkPort { work(): Promise<WorkSummary> }

export interface BrandNode extends IdentityPort, CapabilitiesPort {
  readonly healthPort?: HealthPort;
  readonly metricsPort?: MetricsPort;
  readonly workPort?: WorkPort;
}

/** Which ports a node actually has. This is what the connection matrix is built from. */
export function boundPorts(node: BrandNode): { health: boolean; metrics: boolean; work: boolean } {
  return { health: !!node.healthPort, metrics: !!node.metricsPort, work: !!node.workPort };
}

/** Standard health for any node. A node with no health port is UNKNOWN throughout, not healthy. */
export async function readHealth(node: BrandNode): Promise<HealthComponent[]> {
  if (!node.healthPort) return fullHealth();
  try {
    const reported = await node.healthPort.health();
    return fullHealth(Object.fromEntries(reported.map((c) => [c.name, { state: c.state, detail: c.detail }])) as Partial<Record<HealthComponentName, { state: HealthState; detail: string }>>);
  } catch (e) {
    return fullHealth({ APP: { state: 'FAIL', detail: `health read failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200) } });
  }
}

export async function readMetrics(node: BrandNode): Promise<BrandMetrics> {
  if (!node.metricsPort) return NO_METRICS('no metrics port');
  try { return await node.metricsPort.metrics(); } catch (e) { return NO_METRICS(`metrics read failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)); }
}

// ── Mappers over what already exists in src/lib/retail-os-portfolio.ts ────────────────────────────

/** The existing one-cheap-read connection check, as the DATABASE component. Nothing else is claimed from it. */
export function databaseHealth(conn: { ok: boolean; message: string; ms: number }): HealthComponent {
  return { name: 'DATABASE', state: conn.ok ? 'PASS' : 'FAIL', detail: conn.ok ? `read ok in ${conn.ms}ms` : conn.message.slice(0, 200) };
}

/** Portfolio actuals as BrandMetrics. Contribution only when costs are verified; ROAS only with spend. */
export function metricsFromPortfolio(m: { orders: number; netSales: number; adSpend: number; metaRevenue: number; netProfit: number; costVerified: boolean }): BrandMetrics {
  return {
    ...NO_METRICS('retail-os-portfolio:brandMetrics'),
    revenue: m.netSales,
    orders: m.orders,
    adSpend: m.adSpend,
    roas: m.adSpend > 0 ? Math.round((m.metaRevenue / m.adSpend) * 100) / 100 : null,
    contribution: m.costVerified ? m.netProfit : null,
  };
}
