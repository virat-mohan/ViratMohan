// Builds a BrandNode from the estate data plus injected dependencies. A port is bound only when a runtime
// path really exists for that brand (a registered live database); otherwise the port is absent, so the node
// reports UNKNOWN rather than pretending. Injected deps keep this pure and testable; production passes the
// existing functions from src/lib/retail-os-portfolio.ts.
import { BRAND_CAPABILITIES, type EstateEntry } from './estate';
import {
  databaseHealth, metricsFromPortfolio, type BrandNode, type BrandStatus, type FoundationStatus,
} from './adapter';
import type { HealthComponent } from './states';

export interface LiveBrandRef { key: string }
export interface NodeDeps<B extends LiveBrandRef = LiveBrandRef> {
  /** The registered live brand for this key, or null when it is not registered. */
  live(brandKey: string): B | null;
  checkConnection(brand: B): Promise<{ ok: boolean; message: string; ms: number }>;
  metricsFor(brand: B): Promise<{ orders: number; netSales: number; adSpend: number; metaRevenue: number; netProfit: number; costVerified: boolean }>;
  foundationFor(brandKey: string): FoundationStatus | 'UNKNOWN';
}
export interface RegistryRow { status: BrandStatus; domain: string | null }

export function createBrandNode<B extends LiveBrandRef>(entry: EstateEntry, row: RegistryRow, deps: NodeDeps<B>): BrandNode {
  if (!entry.brandKey) throw new Error(`${entry.id} is not a brand operating node`);
  const brandKey = entry.brandKey;
  const registered = deps.live(brandKey);
  const node: BrandNode = {
    identity: () => ({
      brandId: brandKey, clientId: null, name: entry.brand ?? entry.id, status: row.status,
      owner: entry.owner.split(' ')[0], domain: row.domain, foundation: deps.foundationFor(brandKey),
    }),
    capabilities: () => BRAND_CAPABILITIES[brandKey] ?? [],
    ...(registered ? {
      healthPort: { health: async (): Promise<HealthComponent[]> => [databaseHealth(await deps.checkConnection(registered))] },
      metricsPort: { metrics: async () => metricsFromPortfolio(await deps.metricsFor(registered)) },
    } : {}),
  };
  return node;
}
