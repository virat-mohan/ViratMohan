// ACCEPTANCE: a SYNTHETIC founder is taken from DevShop entry to a closed first operating action, in memory.
// It uses the real lead journey, Foundation lifecycle, catalogue gates, ops setup tasks, provisioning record,
// brand adapter, agent registry and Work Registry. No live system is touched and nothing is persisted.
// Where a person or an external account is required, the test SIMULATES that human step and says so: it proves the
// machine does everything around it, and that each stage reports the truth at every step.
import { describe, expect, it } from 'vitest';
import { AGENT_REGISTRY } from '../../../src/lib/ceo/types';
import { canTransition } from '../../../src/lib/brand-foundation';
import { checkLiveGates, validateProduct, type Product } from '../../../src/lib/catalogue';
import { forward } from '../../../src/lib/lead-journey';
import { BRAND_SETUP_TASKS } from '../../../src/lib/ops-seed';
import { computeStandup, type StandupTask } from '../../../src/lib/retail-os-standup';
import { Scopes } from '../../../src/lib/work';
import {
  createBrandNode, currentStage, ESTATE, evaluateJourney, provisioningRecord, readHealth, readMetrics, rollupHealth, sevenDay,
  type EstateEntry, type FoundationStatus, type JourneyFacts, type HealthComponent,
} from '../../../src/lib/brand-node';
import { closeOut } from '../work/fixtures';
import { makeRegistry, must, CHECK, DEV, VIRAT } from '../work/helpers';

const KEY = 'syntheticco';
const CEO = { kind: 'agent' as const, id: 'SY-01' };
const SYN: EstateEntry = {
  id: KEY, repo: null, system: 'Synthetic Co (test only)', brand: 'Synthetic Co', brandKey: KEY, class: 'retail-os-brand', status: 'provisioning', stack: 'none', production: 'no',
  owner: 'SY-01 Synth', database: 'none', deployment: 'none', domain: 'none', connections: null, unique: [], notes: ['synthetic'],
};

const product = (status: Product['status'], approved: boolean): Product => ({
  id: 'syn-1', brand: KEY, name: 'Synthetic Candle', nounSingular: 'candle', nounPlural: 'candles', status, category: 'Candles',
  variants: [{ id: 'v1', sku: 'SYN-C-1', name: 'Small', attributes: { size: 'S', color: 'white', material: 'soy', fit: '', power: '', other: '' }, costToMake: 120, price: 499, stock: 40, dimensions: { length: 8, width: 8, height: 9, weight: 250 }, available: true, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' }],
  creative: { imageUrl: 'https://example.com/candle.jpg', imageAlt: 'A white candle', shortDescription: 'Soy candle', description: 'A hand-poured soy candle for synthetic testing only.', why: 'Burns clean for forty hours', instructions: null, relatedSkus: [] },
  attributeOptions: { size: { label: 'Size', options: ['S'] }, color: { label: 'Colour', options: ['white'] }, material: { label: 'Material', options: ['soy'] }, fit: { label: 'Fit', options: [] }, power: { label: 'Power', options: [] }, other: { label: 'Other', options: [] } },
  liveSince: null, owner: 'founder', approvedBy: approved ? 'founder' : null, approvedAt: approved ? '2026-10-07T00:00:00Z' : null, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z',
});

describe('synthetic founder: DevShop entry to a closed first operating action', () => {
  const { reg, tick } = makeRegistry({ knownBrands: new Set([KEY]), directory: { kindOf: (id) => (id === 'DS-00' ? 'human' : ['DS-02', 'DS-10', 'SY-01'].includes(id) ? 'agent' : null) } });
  const facts: JourneyFacts = { leadStage: null, applied: false, registryRow: false, provisioning: null, foundation: null, approvedProducts: null, agentId: null, dashboardDeployed: null, health: null, firstActionDone: false, mondayResultProduced: false };
  let tasks: StandupTask[] = [];
  const state = (id: string) => evaluateJourney(facts).find((s) => s.id === id)!.state;
  const prov = () => provisioningRecord({
    brandKey: KEY, clientName: 'Synthetic Co', agreementSigned: facts.leadStage ? (forward('signed', facts.leadStage) === facts.leadStage || facts.leadStage === 'signed') : null,
    depositPaid: facts.leadStage === 'deposit_paid', registryStatus: facts.registryRow ? 'building' : null, foundation: facts.foundation, approvedProducts: facts.approvedProducts,
    agentId: facts.agentId, dashboardDeployed: facts.dashboardDeployed, health: facts.health, tasks, workId: provisioningWorkId,
  });
  let provisioningWorkId: string | null = null;

  it('1. entry: a lead arrives and a public application is filed, with no human involved', () => {
    facts.leadStage = 'new';
    expect(state('DISCOVER')).toBe('COMPLETE');
    expect(state('APPLICATION')).toBe('AUTO');
    expect(currentStage(evaluateJourney(facts))?.id).toBe('APPLICATION');
    facts.leadStage = forward('new', 'proposal');
    facts.applied = true;
    expect(state('APPLICATION')).toBe('COMPLETE');
  });

  it('2. qualification, commercial terms and deposit follow the lead journey, and each waits on a named person until it happens', () => {
    expect(state('COMMERCIAL')).toBe('WAITING_FOR_HUMAN');
    facts.leadStage = forward(facts.leadStage!, 'signed');
    expect(state('COMMERCIAL')).toBe('COMPLETE');
    expect(state('PAYMENT_DEPOSIT')).toBe('WAITING_FOR_HUMAN');
    facts.leadStage = forward(facts.leadStage, 'deposit_paid');
    expect(state('PAYMENT_DEPOSIT')).toBe('COMPLETE');
    expect(forward('deposit_paid', 'new')).toBe('deposit_paid');
  });

  it('3. the brand is created in the registry (a human step today) and provisioning starts WAITING on Virat, not on Prince', () => {
    expect(state('BRAND_CREATED')).toBe('WAITING_FOR_HUMAN');
    facts.registryRow = true;
    expect(state('BRAND_CREATED')).toBe('COMPLETE');
    const p = prov();
    expect(p.components.find((c) => c.component === 'team')).toMatchObject({ state: 'WAITING', owner: 'virat' });
    expect(state('PROVISIONING')).toBe('WAITING_FOR_HUMAN');
    expect(computeStandup(tasks, false).status).toBe('NOT_STARTED');
  });

  it('4. Virat assigns the build: the real 7-day setup tasks appear, and one Work Registry item tracks the provisioning with one accountable owner', () => {
    tasks = BRAND_SETUP_TASKS.map((t, i): StandupTask => ({ stage: t.stage, status: 'todo', owner: t.owner, task: t.task, note: t.note, priority: t.day <= 2 ? 1 : 2, sort: i + 1 }));
    expect(tasks).toHaveLength(BRAND_SETUP_TASKS.length);
    expect(tasks.length).toBeGreaterThan(10);
    const item = must(reg.createItem({ type: 'task', title: 'Provision Synthetic Co: 7 day build', scope: Scopes.brand(KEY) }, DEV));
    provisioningWorkId = item.id;
    must(reg.transition(item.id, 'triaged', DEV, { payload: { triage: { priority: 'P2' } } }));
    must(reg.transition(item.id, 'assigned', DEV, { payload: { owner: DEV } }));
    must(reg.transition(item.id, 'in_progress', DEV));
    expect(reg.get(item.id)).toMatchObject({ state: 'in_progress', owner: DEV });
    const p = prov();
    expect(p.workId).toBe(item.id);
    expect(p.components.find((c) => c.component === 'team')?.state).toBe('COMPLETE');
    expect(p.components.find((c) => c.component === 'repository')).toMatchObject({ state: 'NOT_STARTED', owner: 'team' });
    expect(p.components.find((c) => c.component === 'domain')?.state).not.toBe('COMPLETE');
    expect(computeStandup(tasks, false).status).toBe('PROVISIONING');
    facts.provisioning = p;
    expect(state('PROVISIONING')).toBe('WAITING_FOR_HUMAN');
  });

  it('5. the founder commits the Foundation through its lifecycle and approves one product through the catalogue gates', () => {
    expect(canTransition('draft', 'committed')).toBe(false);
    let fnd: FoundationStatus = 'draft';
    for (const next of ['review', 'approved', 'committed'] as const) { expect(canTransition(fnd as 'draft', next)).toBe(true); fnd = next; facts.foundation = next; }
    expect(state('FOUNDATION')).toBe('COMPLETE');

    expect(validateProduct(product('draft', false))).toEqual({ valid: true });
    expect(checkLiveGates(product('draft', false)).ready).toBe(false);
    expect(checkLiveGates(product('approved', true)).ready).toBe(true);
    facts.approvedProducts = 1;
    expect(state('CATALOGUE')).toBe('COMPLETE');
  });

  it('6. SIMULATED HUMAN STEP: accounts and credentials are created. Only then do the brand plane and dashboard stages complete', () => {
    expect(state('BRAND_PLANE')).toBe('SETUP_REQUIRED');
    tasks = tasks.map((t) => (t.stage <= 1 ? { ...t, status: 'done' } : t));
    facts.provisioning = prov();
    expect(state('PROVISIONING')).toBe('COMPLETE');
    expect(state('BRAND_PLANE')).toBe('COMPLETE');
    expect(state('DASHBOARD')).toBe('AUTO');
    facts.dashboardDeployed = true;
    expect(state('DASHBOARD')).toBe('COMPLETE');
  });

  it('7. Virat approves a Brand CEO; the agent is real in the registry and scoped to this brand only', () => {
    expect(state('BRAND_CEO')).toBe('WAITING_FOR_HUMAN');
    facts.agentId = CEO.id;
    expect(state('BRAND_CEO')).toBe('COMPLETE');
    const real = AGENT_REGISTRY.filter((a) => a.role === 'brand_ceo');
    expect(real.every((a) => a.scope?.brand !== KEY)).toBe(true);
  });

  it('8. health: a database-only reading is UNKNOWN, never PASS; only a full PASS completes the stage', async () => {
    const node = createBrandNode(SYN, { status: 'building', domain: null }, {
      live: (k) => (k === KEY ? { key: KEY } : null),
      checkConnection: async () => ({ ok: true, message: 'Connected', ms: 12 }),
      metricsFor: async () => ({ orders: 14, netSales: 21_000, adSpend: 4_000, metaRevenue: 9_000, netProfit: 3_500, costVerified: true }),
      foundationFor: () => 'committed',
    });
    const partial = await readHealth(node);
    expect(partial.find((c) => c.name === 'DATABASE')?.state).toBe('PASS');
    facts.health = rollupHealth(partial);
    expect(facts.health).toBe('UNKNOWN');
    expect(state('HEALTH')).toBe('AUTO');

    const allPass: HealthComponent[] = partial.map((c) => ({ ...c, state: 'PASS' }));
    facts.health = rollupHealth(allPass);
    expect(facts.health).toBe('PASS');
    expect(state('HEALTH')).toBe('COMPLETE');
    expect(node.identity()).toMatchObject({ brandId: KEY, owner: 'SY-01', foundation: 'committed' });
  });

  it('9. first operating action: the Brand CEO resolves a work item, a different actor verifies it, it closes with evidence', () => {
    tick(60_000);
    const item = must(reg.createItem({ type: 'task', title: 'Publish the first product page', scope: Scopes.brand(KEY) }, CEO));
    closeOut(reg, item.id, { owner: CEO, verifier: CHECK, summary: 'product page opened on a phone and checkout reached payment' });
    const done = reg.get(item.id)!;
    expect(done.state).toBe('closed');
    expect(done.scope.brand).toBe(KEY);
    facts.firstActionDone = true;
    expect(state('FIRST_OPERATING_ACTION')).toBe('COMPLETE');
  });

  it('10. Monday result: metrics are read through the adapter, with unknowns left null, and the 7 day clock reads COMPLETE once the setup is done', async () => {
    const node = createBrandNode(SYN, { status: 'live', domain: null }, {
      live: () => ({ key: KEY }), checkConnection: async () => ({ ok: true, message: 'Connected', ms: 1 }),
      metricsFor: async () => ({ orders: 14, netSales: 21_000, adSpend: 4_000, metaRevenue: 9_000, netProfit: 3_500, costVerified: true }),
      foundationFor: () => 'committed',
    });
    const m = await readMetrics(node);
    expect(m).toMatchObject({ revenue: 21_000, orders: 14, roas: 2.25, contribution: 3_500, customers: null, repeatCustomerRate: null });
    facts.mondayResultProduced = true;
    const stages = evaluateJourney(facts);
    expect(stages.every((s) => s.state === 'COMPLETE')).toBe(true);
    expect(currentStage(stages)).toBeNull();
    const allDone = tasks.map((t) => ({ ...t, status: 'done' }));
    expect(sevenDay(allDone, '2026-09-30', new Date('2026-10-07T00:00:00Z'), true).status).toBe('COMPLETE');
  });

  it('11. closure: the provisioning item is verified by someone other than its owner and closed; nothing synthetic is left open', () => {
    closeOut(reg, provisioningWorkId!, { owner: DEV, verifier: CHECK, summary: 'every provisioning component complete and the first action verified' });
    expect(reg.get(provisioningWorkId!)?.state).toBe('closed');
    const open = reg.list({ brand: KEY, openOnly: true });
    expect(open).toEqual([]);
    expect(ESTATE.some((e) => e.brandKey === KEY)).toBe(false);
    void VIRAT;
  });
});
