// Integration tests A-K: CEO → Brand → Work → Result flow
// Real module implementations, in-memory Work Registry, real brand-node adapter.
// Proves the full path from brand registry → adapter → agent → Work Registry → result.

import { describe, it, expect } from 'vitest';
import { InMemoryWorkRegistry } from '../../../src/lib/work/registry';
import { VIRAT } from '../../../src/lib/work/actors';
import { Scopes } from '../../../src/lib/work/scope';
import { brandCeoFor, AGENT_REGISTRY } from '../../../src/lib/ceo/types';
import { classifyFounderInput } from '../../../src/lib/ceo/founder-input';
import { processFounderInput } from '../../../src/lib/ceo/orchestrator';
import { ESTATE, BRAND_CAPABILITIES } from '../../../src/lib/brand-node/estate';
import { createBrandNode, type NodeDeps, type RegistryRow } from '../../../src/lib/brand-node/node';
import { readHealth, readMetrics, boundPorts } from '../../../src/lib/brand-node/adapter';
import { rollupHealth } from '../../../src/lib/brand-node/states';
import { provisioningRecord, type ProvisioningFacts } from '../../../src/lib/brand-node/provisioning';
import { evaluateJourney, currentStage, JOURNEY_STAGES, type JourneyFacts } from '../../../src/lib/brand-node/journey';

const KNOWN_BRANDS = new Set(['moonglasses', 'caps', 'ceremonykitchen', 'freshforpaws', 'korbi', 'thefeelingco']);

let idCounter = 0;
function makeRegistry() {
  return new InMemoryWorkRegistry({
    knownBrands: KNOWN_BRANDS,
    now: () => '2026-10-07T10:00:00.000Z',
    newId: () => `WRK-TEST-${++idCounter}`,
  });
}

// ── A. Brand registry → adapter ───────────────────────────────────────────────────────────────────

describe('A. Brand registry → adapter', () => {
  it('creates a BrandNode for each live estate entry with a brandKey', () => {
    const liveKeys = new Set(['moonglasses', 'caps']);
    const deps: NodeDeps = {
      live: (k) => liveKeys.has(k) ? { key: k } : null,
      checkConnection: async () => ({ ok: true, message: 'ok', ms: 12 }),
      metricsFor: async () => ({ orders: 10, netSales: 5000, adSpend: 500, metaRevenue: 4800, netProfit: 1200, costVerified: true }),
      foundationFor: () => 'committed',
    };
    const brands = ESTATE.filter((e) => e.brandKey);
    expect(brands.length).toBeGreaterThanOrEqual(5);
    for (const entry of brands) {
      const row: RegistryRow = { status: liveKeys.has(entry.brandKey!) ? 'live' : 'building', domain: null };
      const node = createBrandNode(entry, row, deps);
      expect(node.identity().brandId).toBe(entry.brandKey);
    }
  });

  it('Moon and Travaholic have live ports; Ceremony and Fresh do not', () => {
    const liveKeys = new Set(['moonglasses', 'caps']);
    const deps: NodeDeps = {
      live: (k) => liveKeys.has(k) ? { key: k } : null,
      checkConnection: async () => ({ ok: true, message: 'ok', ms: 5 }),
      metricsFor: async () => ({ orders: 0, netSales: 0, adSpend: 0, metaRevenue: 0, netProfit: 0, costVerified: false }),
      foundationFor: () => 'committed',
    };
    for (const [key, expectLive] of [['moonglasses', true], ['caps', true], ['ceremonykitchen', false], ['freshforpaws', false]] as const) {
      const entry = ESTATE.find((e) => e.brandKey === key);
      if (!entry) continue;
      const node = createBrandNode(entry, { status: expectLive ? 'live' : 'building', domain: null }, deps);
      const ports = boundPorts(node);
      expect(ports.health).toBe(expectLive);
      expect(ports.metrics).toBe(expectLive);
    }
  });
});

// ── B. Adapter → metrics ──────────────────────────────────────────────────────────────────────────

describe('B. Adapter → metrics', () => {
  it('returns real metrics for a live-registered brand', async () => {
    const entry = ESTATE.find((e) => e.brandKey === 'moonglasses')!;
    const deps: NodeDeps = {
      live: (k) => k === 'moonglasses' ? { key: k } : null,
      checkConnection: async () => ({ ok: true, message: 'ok', ms: 8 }),
      metricsFor: async () => ({ orders: 42, netSales: 21000, adSpend: 3000, metaRevenue: 20000, netProfit: 5000, costVerified: true }),
      foundationFor: () => 'committed',
    };
    const node = createBrandNode(entry, { status: 'live', domain: 'moonglasses.in' }, deps);
    const m = await readMetrics(node);
    expect(m.orders).toBe(42);
    expect(m.revenue).toBe(21000);
    expect(m.contribution).toBe(5000);
    expect(m.roas).toBeCloseTo(20000 / 3000, 1);
  });

  it('returns NO_METRICS (all null) for a brand with no metrics port', async () => {
    const entry = ESTATE.find((e) => e.brandKey === 'freshforpaws')!;
    const deps: NodeDeps = {
      live: () => null,
      checkConnection: async () => ({ ok: true, message: 'ok', ms: 5 }),
      metricsFor: async () => ({ orders: 0, netSales: 0, adSpend: 0, metaRevenue: 0, netProfit: 0, costVerified: false }),
      foundationFor: () => 'none',
    };
    const node = createBrandNode(entry, { status: 'building', domain: null }, deps);
    const m = await readMetrics(node);
    expect(m.revenue).toBeNull();
    expect(m.orders).toBeNull();
    expect(m.source).toMatch(/no metrics port/);
  });

  it('contribution is null when costVerified = false', async () => {
    const entry = ESTATE.find((e) => e.brandKey === 'caps')!;
    const deps: NodeDeps = {
      live: (k) => k === 'caps' ? { key: k } : null,
      checkConnection: async () => ({ ok: true, message: 'ok', ms: 5 }),
      metricsFor: async () => ({ orders: 5, netSales: 2500, adSpend: 400, metaRevenue: 2000, netProfit: 600, costVerified: false }),
      foundationFor: () => 'committed',
    };
    const node = createBrandNode(entry, { status: 'live', domain: null }, deps);
    const m = await readMetrics(node);
    expect(m.contribution).toBeNull();
    expect(m.orders).toBe(5);
  });
});

// ── C. Adapter → health ───────────────────────────────────────────────────────────────────────────

describe('C. Adapter → health', () => {
  it('reports PASS for a healthy database connection', async () => {
    const entry = ESTATE.find((e) => e.brandKey === 'moonglasses')!;
    const deps: NodeDeps = {
      live: (k) => k === 'moonglasses' ? { key: k } : null,
      checkConnection: async () => ({ ok: true, message: 'ok', ms: 15 }),
      metricsFor: async () => ({ orders: 0, netSales: 0, adSpend: 0, metaRevenue: 0, netProfit: 0, costVerified: false }),
      foundationFor: () => 'committed',
    };
    const node = createBrandNode(entry, { status: 'live', domain: null }, deps);
    const components = await readHealth(node);
    const db = components.find((c) => c.name === 'DATABASE');
    expect(db?.state).toBe('PASS');
    // We only bind DATABASE; all others are UNKNOWN → rollup is UNKNOWN
    expect(rollupHealth(components)).toBe('UNKNOWN');
  });

  it('reports FAIL when database connection fails', async () => {
    const entry = ESTATE.find((e) => e.brandKey === 'caps')!;
    const deps: NodeDeps = {
      live: (k) => k === 'caps' ? { key: k } : null,
      checkConnection: async () => ({ ok: false, message: 'connection refused', ms: 5000 }),
      metricsFor: async () => ({ orders: 0, netSales: 0, adSpend: 0, metaRevenue: 0, netProfit: 0, costVerified: false }),
      foundationFor: () => 'committed',
    };
    const node = createBrandNode(entry, { status: 'live', domain: null }, deps);
    const components = await readHealth(node);
    const db = components.find((c) => c.name === 'DATABASE');
    expect(db?.state).toBe('FAIL');
    expect(rollupHealth(components)).toBe('FAIL');
  });

  it('returns all-UNKNOWN for a brand with no health port', async () => {
    const entry = ESTATE.find((e) => e.brandKey === 'ceremonykitchen')!;
    const deps: NodeDeps = {
      live: () => null,
      checkConnection: async () => ({ ok: true, message: 'ok', ms: 5 }),
      metricsFor: async () => ({ orders: 0, netSales: 0, adSpend: 0, metaRevenue: 0, netProfit: 0, costVerified: false }),
      foundationFor: () => 'none',
    };
    const node = createBrandNode(entry, { status: 'building', domain: null }, deps);
    const components = await readHealth(node);
    expect(components.every((c) => c.state === 'UNKNOWN')).toBe(true);
  });
});

// ── D. Agent → brand scope ────────────────────────────────────────────────────────────────────────

describe('D. Agent → brand scope', () => {
  it('every Brand CEO in AGENT_REGISTRY uses a valid known brand key', () => {
    for (const agent of AGENT_REGISTRY) {
      if (agent.scope?.kind === 'brand') {
        expect(KNOWN_BRANDS.has(agent.scope.brand), `${agent.id} scope brand '${agent.scope.brand}' not in known brands`).toBe(true);
      }
    }
  });

  it('brandCeoFor returns the correct CEO for each known brand', () => {
    expect(brandCeoFor('ceremonykitchen')?.id).toBe('CK-01');
    expect(brandCeoFor('caps')?.id).toBe('TC-01');
    expect(brandCeoFor('moonglasses')?.id).toBe('MG-01');
  });

  it('brandCeoFor returns undefined for wrong brand keys', () => {
    expect(brandCeoFor('ceremony')).toBeUndefined(); // wrong key
    expect(brandCeoFor('travaholic')).toBeUndefined(); // wrong key
  });

  it('Work Registry accepts brand scopes for known brands only', () => {
    const reg = makeRegistry();
    const r1 = reg.createItem(
      { title: 'Test: caps order', type: 'task', scope: Scopes.brand('caps') },
      VIRAT,
    );
    expect(r1.ok).toBe(true);

    const r2 = reg.createItem(
      { title: 'Test: bad brand', type: 'task', scope: Scopes.brand('ceremony') },
      VIRAT,
    );
    expect(r2.ok).toBe(false);
    expect(r2.ok === false && r2.error.message).toMatch(/unknown brand|ceremony/i);
  });
});

// ── E. CEO → Brand CEO routing ────────────────────────────────────────────────────────────────────

describe('E. CEO → Brand CEO routing', () => {
  it('routes a Travaholic order issue to caps brand scope', () => {
    const reg = makeRegistry();
    const input = classifyFounderInput(
      'There is a problem with a Travaholic Caps order, customer hasnt received it',
      VIRAT,
      { brand: 'caps' },
    );
    expect(input.brand).toBe('caps');
    const outcome = processFounderInput(input, reg);
    expect(outcome.authority.allowed).toBe(true);
    expect(outcome.kind).not.toBe('denied');
  });

  it('routes a Ceremony request with ceremonykitchen brand scope', () => {
    const reg = makeRegistry();
    const input = classifyFounderInput(
      'The Ceremony Kitchen catalogue page is loading slowly',
      VIRAT,
      { brand: 'ceremonykitchen' },
    );
    expect(input.brand).toBe('ceremonykitchen');
    const outcome = processFounderInput(input, reg);
    expect(outcome.authority.allowed).toBe(true);
  });

  it('an unbranded DevShop request is allowed', () => {
    const reg = makeRegistry();
    const input = classifyFounderInput('Review the release-gate checks before next deploy', VIRAT);
    const outcome = processFounderInput(input, reg);
    expect(outcome.authority.allowed).toBe(true);
  });
});

// ── F. CEO → Work Registry ────────────────────────────────────────────────────────────────────────

describe('F. CEO → Work Registry', () => {
  it('creates a work item with audit trail when founder reports an issue', () => {
    const reg = makeRegistry();
    const input = classifyFounderInput(
      'Moon Glasses checkout is broken, customers cannot complete payment',
      VIRAT,
      { brand: 'moonglasses' },
    );
    const outcome = processFounderInput(input, reg);
    expect(outcome.authority.allowed).toBe(true);
    if (outcome.mutationApplied && outcome.workItem) {
      const item = reg.list().find((i) => i.id === outcome.workItem!.id);
      expect(item).toBeDefined();
      expect(item!.events.length).toBeGreaterThan(0);
      // Events have timestamps
      for (const ev of item!.events) {
        expect(ev.at).toBeDefined();
        expect(ev.actor).toBeDefined();
      }
    }
  });

  it('brand scope is recorded in work items created for brand requests', () => {
    const reg = makeRegistry();
    const input = classifyFounderInput('Travaholic Caps page is down', VIRAT, { brand: 'caps' });
    const outcome = processFounderInput(input, reg);
    if (outcome.mutationApplied && outcome.workItem) {
      const item = reg.list().find((i) => i.id === outcome.workItem!.id)!;
      if (item.scope.kind === 'brand') {
        expect((item.scope as { brand: string }).brand).toBe('caps');
      }
    }
  });

  it('work items for Fresh are scoped to freshforpaws', () => {
    const reg = makeRegistry();
    const input = classifyFounderInput('Fresh For Paws product images are missing', VIRAT, { brand: 'freshforpaws' });
    const outcome = processFounderInput(input, reg);
    expect(outcome.authority.allowed).toBe(true);
    // Fresh is a known brand — no rejection
    expect(outcome.kind).not.toBe('denied');
  });
});

// ── G. Application → provisioning ────────────────────────────────────────────────────────────────

describe('G. Application → provisioning', () => {
  it('a brand with no facts returns overall IN_PROGRESS or NOT_STARTED', () => {
    // With no facts, client and brand are NOT_STARTED but tasks is empty so team = WAITING
    const facts: ProvisioningFacts = {
      brandKey: 'testbrand', clientName: null, agreementSigned: null, depositPaid: null,
      registryStatus: null, foundation: null, approvedProducts: null, agentId: null,
      dashboardDeployed: null, health: null, tasks: [], workId: null,
    };
    const rec = provisioningRecord(facts);
    expect(['NOT_STARTED', 'IN_PROGRESS', 'WAITING']).toContain(rec.overall);
    expect(rec.complete).toBe(0);
    expect(rec.total).toBeGreaterThan(0);
  });

  it('a complete brand returns COMPLETE with all components done', () => {
    // supply tasks for every fromTasks() component to return COMPLETE
    const fakeTasks = [
      { id: 't1', task: 'Set up github repo', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 0, note: null },
      { id: 't2', task: 'Set up supabase project', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 1, note: null },
      { id: 't3', task: 'Set up ADMIN_PASSWORD environment variable', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 2, note: null },
      { id: 't4', task: 'Deploy to vercel', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 3, note: null },
      { id: 't5', task: 'Set up domain and nameserver', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 4, note: null },
      { id: 't6', task: 'Set up payments gateway', status: 'done' as const, owner: 'team', stage: 2, priority: 1, sort: 5, note: null },
      { id: 't7', task: 'Set up shipping and commerce', status: 'done' as const, owner: 'team', stage: 3, priority: 1, sort: 6, note: null },
      { id: 't8', task: 'Set up email integration', status: 'done' as const, owner: 'team', stage: 4, priority: 1, sort: 7, note: null },
      { id: 't9', task: 'Set up whatsapp integration', status: 'done' as const, owner: 'team', stage: 5, priority: 1, sort: 8, note: null },
      { id: 't10', task: 'Set up analytics and google search console pixel', status: 'done' as const, owner: 'team', stage: 7, priority: 1, sort: 9, note: null },
      { id: 't11', task: 'Go live review', status: 'done' as const, owner: 'team', stage: 9, priority: 1, sort: 10, note: null },
    ];
    const facts: ProvisioningFacts = {
      brandKey: 'caps', clientName: 'Travaholic Caps Ltd', agreementSigned: true, depositPaid: true,
      registryStatus: 'live', foundation: 'committed', approvedProducts: 12, agentId: 'TC-01',
      dashboardDeployed: true, health: 'PASS', workId: 'WRK-001', tasks: fakeTasks,
    };
    const rec = provisioningRecord(facts);
    const notComplete = rec.components.filter((c) => c.state !== 'COMPLETE');
    // All should be complete
    expect(notComplete.map((c) => `${c.component}:${c.state}`)).toEqual([]);
    expect(rec.overall).toBe('COMPLETE');
  });

  it('observed override replaces stale task state', () => {
    const facts: ProvisioningFacts = {
      brandKey: 'freshforpaws', clientName: 'Fresh For Paws', agreementSigned: true, depositPaid: true,
      registryStatus: 'building', foundation: 'committed', approvedProducts: 0, agentId: null,
      dashboardDeployed: false, health: 'UNKNOWN', workId: null, tasks: [],
      observed: {
        database: { state: 'COMPLETE', detail: 'Supabase project active, schema applied' },
        repository: { state: 'COMPLETE', detail: 'GitHub repo exists' },
      },
    };
    const rec = provisioningRecord(facts);
    const db = rec.components.find((c) => c.component === 'database')!;
    expect(db.state).toBe('COMPLETE');
    expect(db.detail).toMatch(/observed/);
  });
});

// ── H. Fresh For Paws provisioning state ─────────────────────────────────────────────────────────

describe('H. Fresh For Paws provisioning state', () => {
  it('Fresh with observed facts is at least 5 components complete', () => {
    const facts: ProvisioningFacts = {
      brandKey: 'freshforpaws', clientName: 'Fresh For Paws', agreementSigned: true, depositPaid: true,
      registryStatus: 'building', foundation: null, approvedProducts: null, agentId: null,
      dashboardDeployed: false, health: 'UNKNOWN', workId: null, tasks: [],
      observed: {
        database: { state: 'COMPLETE', detail: 'Supabase ACTIVE_HEALTHY, schema applied' },
        repository: { state: 'COMPLETE', detail: 'virat-mohan/fresh-for-paws repo exists' },
      },
    };
    const rec = provisioningRecord(facts);
    // client + agreement + payment + brand + brand_registry + database_observed + repository_observed = 7
    expect(rec.complete).toBeGreaterThanOrEqual(5);
    expect(rec.overall).not.toBe('NOT_STARTED');
    expect(rec.overall).not.toBe('COMPLETE');
  });

  it('Fresh provisioning nextAction points to a real outstanding step', () => {
    const facts: ProvisioningFacts = {
      brandKey: 'freshforpaws', clientName: 'Fresh For Paws', agreementSigned: true, depositPaid: true,
      registryStatus: 'building', foundation: null, approvedProducts: null, agentId: null,
      dashboardDeployed: false, health: 'UNKNOWN', workId: null, tasks: [],
      observed: {
        database: { state: 'COMPLETE', detail: 'live' },
        repository: { state: 'COMPLETE', detail: 'live' },
      },
    };
    const rec = provisioningRecord(facts);
    expect(rec.nextAction).not.toBeNull();
    // Foundation or catalogue is the natural next step
    expect(rec.nextAction!.component).toBeDefined();
  });
});

// ── I. Dashboard canonical data ───────────────────────────────────────────────────────────────────

describe('I. Dashboard canonical data', () => {
  it('every known brand has at least one capability defined', () => {
    for (const key of ['moonglasses', 'caps', 'ceremonykitchen', 'freshforpaws']) {
      const caps = BRAND_CAPABILITIES[key];
      expect(caps, `${key} has no capabilities`).toBeDefined();
      expect(caps!.length, `${key} has 0 capabilities`).toBeGreaterThan(0);
    }
  });

  it('Moon and Travaholic have LIVE capabilities', () => {
    expect(BRAND_CAPABILITIES['moonglasses']!.filter((c) => c.state === 'LIVE').length).toBeGreaterThan(0);
    expect(BRAND_CAPABILITIES['caps']!.filter((c) => c.state === 'LIVE').length).toBeGreaterThan(0);
  });

  it('Fresh capabilities have no LIVE items (not deployed yet)', () => {
    const liveCaps = (BRAND_CAPABILITIES['freshforpaws'] ?? []).filter((c) => c.state === 'LIVE');
    expect(liveCaps.length).toBe(0);
  });

  it('estate has at least 5 brand entries', () => {
    expect(ESTATE.filter((e) => e.brandKey).length).toBeGreaterThanOrEqual(5);
  });
});

// ── J. Multi-brand isolation ──────────────────────────────────────────────────────────────────────

describe('J. Multi-brand isolation', () => {
  it('reading Moon metrics never triggers Travaholic deps', async () => {
    const calls: string[] = [];
    const deps: NodeDeps = {
      live: (k) => ['moonglasses', 'caps'].includes(k) ? { key: k } : null,
      checkConnection: async (b) => { calls.push(`conn:${b.key}`); return { ok: true, message: 'ok', ms: 5 }; },
      metricsFor: async (b) => { calls.push(`metrics:${b.key}`); return { orders: 10, netSales: 5000, adSpend: 500, metaRevenue: 4800, netProfit: 1200, costVerified: true }; },
      foundationFor: () => 'committed',
    };
    const moonEntry = ESTATE.find((e) => e.brandKey === 'moonglasses')!;
    const moonNode = createBrandNode(moonEntry, { status: 'live', domain: null }, deps);
    await readMetrics(moonNode);
    expect(calls.some((c) => c.includes('caps'))).toBe(false);
    expect(calls.some((c) => c.includes('moonglasses'))).toBe(true);
  });

  it('Ceremony and Fresh Work Registry items never share an id', () => {
    const reg = makeRegistry();
    const i1 = classifyFounderInput('Ceremony checkout issue', VIRAT, { brand: 'ceremonykitchen' });
    const i2 = classifyFounderInput('Fresh product page issue', VIRAT, { brand: 'freshforpaws' });
    const o1 = processFounderInput(i1, reg);
    const o2 = processFounderInput(i2, reg);
    if (o1.workItem && o2.workItem) {
      expect(o1.workItem.id).not.toBe(o2.workItem.id);
    }
    const allItems = reg.list();
    const ids = allItems.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });

  it('Ceremony and Fresh return null revenue (no metrics port)', async () => {
    const deps: NodeDeps = {
      live: () => null,
      checkConnection: async () => ({ ok: true, message: 'ok', ms: 5 }),
      metricsFor: async () => ({ orders: 0, netSales: 0, adSpend: 0, metaRevenue: 0, netProfit: 0, costVerified: false }),
      foundationFor: () => 'none',
    };
    for (const key of ['ceremonykitchen', 'freshforpaws']) {
      const entry = ESTATE.find((e) => e.brandKey === key);
      if (!entry) continue;
      const node = createBrandNode(entry, { status: 'building', domain: null }, deps);
      const m = await readMetrics(node);
      expect(m.revenue).toBeNull();
    }
  });
});

// ── K. Synthetic self-serve journey ───────────────────────────────────────────────────────────────

describe('K. Synthetic self-serve journey', () => {
  const base: JourneyFacts = {
    leadStage: null, applied: false, registryRow: false, provisioning: null,
    foundation: null, approvedProducts: null, agentId: null, dashboardDeployed: null,
    health: null, firstActionDone: false, mondayResultProduced: false,
  };

  it('a brand with no facts starts at DISCOVER', () => {
    const current = currentStage(evaluateJourney(base));
    expect(current?.id).toBe('DISCOVER');
  });

  it('after application, current stage is QUALIFICATION', () => {
    const current = currentStage(evaluateJourney({ ...base, leadStage: 'new', applied: true }));
    expect(current?.id).toBe('QUALIFICATION');
  });

  it('after deposit, current stage is BRAND_CREATED', () => {
    const current = currentStage(evaluateJourney({ ...base, leadStage: 'deposit_paid', applied: true }));
    expect(current?.id).toBe('BRAND_CREATED');
  });

  it('all 15 journey stages are defined', () => {
    expect(JOURNEY_STAGES).toHaveLength(15);
  });

  it('HEALTH stage is FAILED when health = FAIL', () => {
    const stages = evaluateJourney({
      ...base, leadStage: 'deposit_paid', applied: true, registryRow: true,
      foundation: 'committed', approvedProducts: 5, agentId: 'FP-01', dashboardDeployed: true, health: 'FAIL',
    });
    expect(stages.find((s) => s.id === 'HEALTH')?.state).toBe('FAILED');
  });

  it('a completed journey reaches MONDAY_RESULT', () => {
    // Provisioning needs team/repository/database/environment complete; use observed to satisfy
    const provFacts: ProvisioningFacts = {
      brandKey: 'caps', clientName: 'Caps', agreementSigned: true, depositPaid: true,
      registryStatus: 'live', foundation: 'committed', approvedProducts: 5, agentId: 'TC-01',
      dashboardDeployed: true, health: 'PASS', workId: null,
      tasks: [
        { id: 't1', task: 'Set up github repo', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 0, note: null },
        { id: 't2', task: 'Set up supabase project', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 1, note: null },
        { id: 't3', task: 'Set up ADMIN_PASSWORD environment variable', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 2, note: null },
        { id: 't4', task: 'Deploy to vercel', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 3, note: null },
        { id: 't5', task: 'Set up domain', status: 'done' as const, owner: 'team', stage: 1, priority: 1, sort: 4, note: null },
        { id: 't6', task: 'Set up payments gateway', status: 'done' as const, owner: 'team', stage: 2, priority: 1, sort: 5, note: null },
        { id: 't7', task: 'Set up shipping and commerce', status: 'done' as const, owner: 'team', stage: 3, priority: 1, sort: 6, note: null },
        { id: 't8', task: 'Set up email integration', status: 'done' as const, owner: 'team', stage: 4, priority: 1, sort: 7, note: null },
        { id: 't9', task: 'Set up whatsapp integration', status: 'done' as const, owner: 'team', stage: 5, priority: 1, sort: 8, note: null },
        { id: 't10', task: 'Set up analytics and pixel', status: 'done' as const, owner: 'team', stage: 7, priority: 1, sort: 9, note: null },
        { id: 't11', task: 'Go live review', status: 'done' as const, owner: 'team', stage: 9, priority: 1, sort: 10, note: null },
      ],
    };
    const prov = provisioningRecord(provFacts);
    const stages = evaluateJourney({
      ...base, leadStage: 'deposit_paid', applied: true, registryRow: true,
      provisioning: prov, foundation: 'committed', approvedProducts: 5, agentId: 'TC-01',
      dashboardDeployed: true, health: 'PASS', firstActionDone: true, mondayResultProduced: true,
    });
    const current = currentStage(stages);
    expect(current).toBeNull(); // all complete
  });
});
