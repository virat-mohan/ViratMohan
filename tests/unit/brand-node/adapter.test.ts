import { describe, expect, it } from 'vitest';
import { boundPorts, databaseHealth, metricsFromPortfolio, NO_METRICS, readHealth, readMetrics, type BrandNode } from '../../../src/lib/brand-node';

const bare = (extra: Partial<BrandNode> = {}): BrandNode => ({
  identity: () => ({ brandId: 'x', clientId: null, name: 'X', status: 'building', owner: 'XB-01', domain: null, foundation: 'UNKNOWN' }),
  capabilities: () => [],
  ...extra,
});

describe('brand adapter ports', () => {
  it('a node with no ports is UNKNOWN throughout, has no metrics, and says which ports it lacks', async () => {
    const n = bare();
    expect(boundPorts(n)).toEqual({ health: false, metrics: false, work: false });
    const h = await readHealth(n);
    expect(h).toHaveLength(12);
    expect(h.every((c) => c.state === 'UNKNOWN')).toBe(true);
    const m = await readMetrics(n);
    expect(m.revenue).toBeNull();
    expect(m.source).toBe('no metrics port');
  });

  it('a health port reports its components and the rest stay UNKNOWN', async () => {
    const n = bare({ healthPort: { health: async () => [{ name: 'DATABASE', state: 'PASS', detail: 'ok' }] } });
    const h = await readHealth(n);
    expect(h.find((c) => c.name === 'DATABASE')?.state).toBe('PASS');
    expect(h.find((c) => c.name === 'PAYMENTS')?.state).toBe('UNKNOWN');
    expect(boundPorts(n).health).toBe(true);
  });

  it('a throwing health or metrics port is a FAIL or an unknown reading, never a crash or a fake pass', async () => {
    const n = bare({ healthPort: { health: async () => { throw new Error('boom'); } }, metricsPort: { metrics: async () => { throw new Error('nope'); } } });
    expect((await readHealth(n)).find((c) => c.name === 'APP')?.state).toBe('FAIL');
    const m = await readMetrics(n);
    expect(m.revenue).toBeNull();
    expect(m.source).toContain('metrics read failed');
  });

  it('the database component comes from the existing connection check and never echoes more than it was given', () => {
    expect(databaseHealth({ ok: true, message: 'Connected', ms: 42 })).toEqual({ name: 'DATABASE', state: 'PASS', detail: 'read ok in 42ms' });
    expect(databaseHealth({ ok: false, message: 'rejected the key', ms: 0 }).state).toBe('FAIL');
  });

  it('portfolio metrics map without inventing numbers: contribution only when costs are verified, ROAS only with spend', () => {
    const base = { orders: 10, netSales: 50_000, adSpend: 10_000, metaRevenue: 30_000, netProfit: 7_000, costVerified: true };
    expect(metricsFromPortfolio(base)).toMatchObject({ revenue: 50_000, orders: 10, adSpend: 10_000, roas: 3, contribution: 7_000, customers: null, repeatCustomerRate: null });
    expect(metricsFromPortfolio({ ...base, costVerified: false }).contribution).toBeNull();
    expect(metricsFromPortfolio({ ...base, adSpend: 0 }).roas).toBeNull();
    expect(NO_METRICS('s').orders).toBeNull();
  });
});
