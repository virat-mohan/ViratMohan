// Multi-brand proof for Moon, Travaholic Caps, Ceremony Kitchen and Fresh For Paws: identity, adapter, capabilities,
// agent scope, health, work scope, data isolation, and every unique feature preserved. Fixtures only: no live system.
import { describe, expect, it } from 'vitest';
import { AGENT_REGISTRY } from '../../../src/lib/ceo/types';
import { BRAND_CAPABILITIES, boundPorts, createBrandNode, ESTATE, readHealth, readMetrics, rollupHealth, type EstateEntry } from '../../../src/lib/brand-node';

const FOUR = ['moonglasses', 'caps', 'ceremonykitchen', 'freshforpaws'] as const;
const CEO_OF: Record<string, string> = { moonglasses: 'MG-01', caps: 'TC-01', ceremonykitchen: 'CK-01', freshforpaws: 'FP-01' };
const entry = (k: string) => ESTATE.find((e) => e.brandKey === k) as EstateEntry;

// Only Moon and Travaholic are treated as registered in the portfolio reader here; Ceremony and Fresh have no runtime binding.
const calls: { check: string[]; metrics: string[] } = { check: [], metrics: [] };
const NUMBERS: Record<string, number> = { moonglasses: 111_000, caps: 222_000 };
const deps = {
  live: (k: string) => (k in NUMBERS ? { key: k } : null),
  checkConnection: async (b: { key: string }) => { calls.check.push(b.key); return { ok: true, message: 'Connected', ms: 5 }; },
  metricsFor: async (b: { key: string }) => { calls.metrics.push(b.key); return { orders: 1, netSales: NUMBERS[b.key], adSpend: 0, metaRevenue: 0, netProfit: 0, costVerified: false }; },
  foundationFor: () => 'UNKNOWN' as const,
};
const node = (k: string) => createBrandNode(entry(k), { status: 'live', domain: null }, deps);

describe('Moon, Travaholic, Ceremony and Fresh For Paws on the one operating contract', () => {
  it('brand identity: each node reports its own registry key and is owned by its own Brand CEO', () => {
    for (const k of FOUR) {
      const id = node(k).identity();
      expect(id.brandId).toBe(k);
      expect(id.owner).toBe(CEO_OF[k]);
      const agent = AGENT_REGISTRY.find((a) => a.id === CEO_OF[k])!;
      expect(agent.scope?.brand).toBe(k);
      expect(agent.reports_to).toBe('DS-02');
    }
    expect(new Set(FOUR.map((k) => node(k).identity().owner)).size).toBe(4);
  });

  it('adapter: ports are bound only where a runtime path exists, so Ceremony and Fresh honestly have none yet', () => {
    expect(boundPorts(node('moonglasses'))).toEqual({ health: true, metrics: true, work: false });
    expect(boundPorts(node('caps'))).toEqual({ health: true, metrics: true, work: false });
    expect(boundPorts(node('ceremonykitchen'))).toEqual({ health: false, metrics: false, work: false });
    expect(boundPorts(node('freshforpaws'))).toEqual({ health: false, metrics: false, work: false });
  });

  it('health: nothing unknown looks healthy. Registered brands show DATABASE only; the others are UNKNOWN throughout', async () => {
    for (const k of FOUR) {
      const h = await readHealth(node(k));
      expect(rollupHealth(h), k).toBe('UNKNOWN');
      expect(h.filter((c) => c.state === 'PASS').length, k).toBe(k in NUMBERS ? 1 : 0);
    }
  });

  it('data isolation: reading one brand never touches another brand, and values do not leak across brands', async () => {
    calls.check.length = 0; calls.metrics.length = 0;
    const [moon, caps, cera, fresh] = await Promise.all(FOUR.map((k) => readMetrics(node(k))));
    expect(moon.revenue).toBe(111_000);
    expect(caps.revenue).toBe(222_000);
    expect(cera.revenue).toBeNull();
    expect(fresh.revenue).toBeNull();
    expect([...calls.metrics].sort()).toEqual(['caps', 'moonglasses']);
    await Promise.all(FOUR.map((k) => readHealth(node(k))));
    expect([...calls.check].sort()).toEqual(['caps', 'moonglasses']);
  });

  it('metrics never invent: unverified costs give a null contribution, and customers are unknown, not zero', async () => {
    const m = await readMetrics(node('moonglasses'));
    expect(m.contribution).toBeNull();
    expect(m.customers).toBeNull();
    expect(m.repeatCustomerRate).toBeNull();
  });

  it('capabilities: all eleven are declared for every brand, with state and a reason where it is not plain LIVE', () => {
    for (const k of FOUR) {
      const caps = node(k).capabilities();
      expect(caps).toHaveLength(11);
      for (const c of caps) if (!['LIVE', 'AVAILABLE'].includes(c.state)) expect(c.note.length, `${k}.${c.key}`).toBeGreaterThan(0);
    }
  });

  it('unique features are preserved and visible, not flattened into core', () => {
    const cap = (k: string, key: string) => BRAND_CAPABILITIES[k].find((c) => c.key === key)!;
    expect(cap('ceremonykitchen', 'inventory')).toMatchObject({ state: 'LIVE' });
    expect(cap('ceremonykitchen', 'inventory').note).toMatch(/Inventory Master/);
    expect(cap('ceremonykitchen', 'finance').state).toBe('CLIENT_SPECIFIC');
    expect(cap('ceremonykitchen', 'operations').state).toBe('CLIENT_SPECIFIC');
    expect(cap('moonglasses', 'creator').state).toBe('LIVE');
    expect(cap('moonglasses', 'client_extensions').note).toMatch(/try-on/);
    expect(cap('caps', 'client_extensions').note).toMatch(/Miles/);
    expect(cap('freshforpaws', 'commerce').note).toMatch(/WooCommerce/);
    expect(cap('freshforpaws', 'client_extensions').state).toBe('CLIENT_SPECIFIC');
    const text = (k: string) => entry(k).unique.join(' | ');
    expect(text('moonglasses')).toMatch(/try-on/);
    expect(text('moonglasses')).toMatch(/creators/);
    expect(text('caps')).toMatch(/Miles/);
    expect(text('caps')).toMatch(/performance manager/);
    expect(text('ceremonykitchen')).toMatch(/Inventory Master/);
    expect(text('ceremonykitchen')).toMatch(/Ceremony Finance/);
    expect(text('ceremonykitchen')).toMatch(/RBAC/);
    expect(text('freshforpaws')).toMatch(/WooCommerce/);
    expect(text('freshforpaws')).toMatch(/weekly statement/);
  });

  it('Ceremony stays a client extension and keeps its own shell; Fresh is provisioning, not production', () => {
    expect(entry('ceremonykitchen').class).toBe('client-extension');
    expect(entry('ceremonykitchen').connections!.dashboard.note).toMatch(/Preserved as is/);
    expect(entry('freshforpaws')).toMatchObject({ status: 'provisioning', production: 'no', repo: null });
    expect(entry('freshforpaws').connections!.dashboard.state).toBe('SETUP_REQUIRED');
  });

  it('work scope: the four Brand CEOs have four different scopes and none is the control plane', () => {
    const scopes = FOUR.map((k) => AGENT_REGISTRY.find((a) => a.id === CEO_OF[k])!.scope!);
    expect(new Set(scopes.map((s) => s.brand)).size).toBe(4);
    expect(scopes.every((s) => s.kind === 'brand')).toBe(true);
  });
});
