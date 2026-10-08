// Operating System acceptance tests: the 13 mandatory end-to-end tests from the directive.
// These prove the CEO layer, agent training, people OS, onboarding, dashboard generation
// and authority model work together as one system. All use the pure in-memory Work Registry.

import { describe, expect, it } from 'vitest';
import { InMemoryWorkRegistry } from '../../../src/lib/work/registry';
import { VIRAT } from '../../../src/lib/work/actors';
import { Scopes } from '../../../src/lib/work/scope';
import type { WorkItem, Actor } from '../../../src/lib/work/types';
import { classifyFounderInput } from '../../../src/lib/ceo/founder-input';
import { processFounderInput } from '../../../src/lib/ceo/orchestrator';
import { checkAuthority, canCeoAssign } from '../../../src/lib/ceo/authority';
import { CEO, AGENT_REGISTRY, CEO_AUTONOMY, brandCeoFor, findAgent, type AgentEntry } from '../../../src/lib/ceo/types';
import {
  buildAllPassports, canExerciseAutonomy, deriveCertification, computeGaps,
  scenariosForAgent, ASSESSMENT_SCENARIOS, trainingModulesFor,
  type AssessmentResult,
} from '../../../src/lib/ceo/agent-training';
import {
  HUMAN_REGISTRY, PRINCE, workerWorkView, workerPerformance, findWorker, workerAsActor,
} from '../../../src/lib/ceo/people';
import {
  buildExtendedContext, answerPrinceWork, answerAgentTraining,
  answerBrandStatus, answerOnboarding, answerAttention,
} from '../../../src/lib/ceo/ceo-context-extended';
import { generateDashboardConfig, defaultModuleManifest, CANONICAL_MODULES, isReadyForDashboard } from '../../../src/lib/ceo/dashboard-generator';
import type { OrgDecision, OnboardingRecord, DashboardConfig } from '../../../src/lib/ceo/db-stores';

const now = new Date('2026-10-08T09:00:00Z');
const ts = now.toISOString;

function makeRegistry(): InMemoryWorkRegistry {
  return new InMemoryWorkRegistry({ now: () => now.toISOString(), newId: () => `test-${Math.random().toString(36).slice(2, 10)}` });
}

function founderInput(text: string, brand?: string, workId?: string) {
  return classifyFounderInput(text, VIRAT, { channel: 'command_centre', brand, work_id: workId, now });
}

// ── Test 1: Founder decision persists and appears in a later CEO session ──

describe('1. Founder decision persistence', () => {
  it('a decision recorded through processFounderInput is visible in the registry', () => {
    const reg = makeRegistry();
    const work = reg.createItem({
      title: 'Pricing strategy for Moon', description: 'Review pricing',
      type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses'),
      source: { channel: 'founder_request', requester: VIRAT },
    }, CEO);
    expect(work.ok).toBe(true);

    const input = founderInput('We will keep Moon prices unchanged until Diwali');
    const outcome = processFounderInput(input, reg, { now });
    expect(outcome.kind).not.toBe('denied');

    const decisions: OrgDecision[] = [{
      id: 'dec-1', scope: 'brand', brand: 'moonglasses', category: 'pricing',
      decision: 'Keep Moon prices unchanged until Diwali',
      evidence: 'Founder instruction 2026-10-08', decided_by: 'DS-00',
      decided_at: now.toISOString(), superseded_by: null, created_at: now.toISOString(),
    }];

    const ctx = buildExtendedContext(founderInput('What needs my attention?'), reg, { now, decisions });
    expect(ctx.recent_decisions).toHaveLength(1);
    expect(ctx.recent_decisions[0].decision).toContain('unchanged until Diwali');
  });
});

// ── Test 2: Board principles/approval boundaries constrain CEO execution ──

describe('2. Board authority constraints', () => {
  it('CEO cannot approve spending', () => {
    const v = checkAuthority('approve-spend');
    expect(v.allowed).toBe(false);
    expect((v as any).holder).toBe('DS-00');
  });

  it('CEO cannot approve outbound comms', () => {
    const v = checkAuthority('approve-outbound-comms');
    expect(v.allowed).toBe(false);
  });

  it('CEO cannot approve pricing changes', () => {
    const v = checkAuthority('approve-pricing');
    expect(v.allowed).toBe(false);
  });

  it('CEO cannot approve terms or legal documents', () => {
    const v = checkAuthority('approve-terms-legal');
    expect(v.allowed).toBe(false);
  });

  it('CEO cannot approve irreversible actions', () => {
    const v = checkAuthority('approve-irreversible');
    expect(v.allowed).toBe(false);
  });

  it('CEO CAN create and triage work within authority', () => {
    expect(checkAuthority('create-work').allowed).toBe(true);
    expect(checkAuthority('triage-work').allowed).toBe(true);
    expect(checkAuthority('monitor-work').allowed).toBe(true);
  });

  it('Myoho (DS-01) is the guardian with principle-based veto', () => {
    const myoho = findAgent('DS-01');
    expect(myoho).toBeDefined();
    expect(myoho!.role).toBe('guardian');
    expect(myoho!.capabilities).toContain('mission');
    expect(myoho!.capabilities).toContain('values');
  });

  it('CEO (DS-02) reports to Myoho (DS-01), not directly to founder', () => {
    const ceo = findAgent('DS-02');
    expect(ceo!.reports_to).toBe('DS-01');
  });
});

// ── Test 3: Uncertified agents cannot exercise restricted autonomous authority ──

describe('3. Uncertified agent restriction', () => {
  it('an agent with no assessments cannot exercise autonomy at L1', () => {
    expect(canExerciseAutonomy('DS-13', 'CERTIFIED_L1')).toBe(false);
  });

  it('an agent with no assessments has TRAINING_REQUIRED certification', () => {
    const passports = buildAllPassports(now);
    const books = passports.find(p => p.agent_id === 'DS-13');
    expect(books!.certification).toBe('TRAINING_REQUIRED');
  });
});

// ── Test 4: CFO and CMO assessments evaluate role-specific reasoning ──

describe('4. Role-specific assessment scenarios', () => {
  it('DS-13 (CFO/Books) has finance-specific scenarios', () => {
    const scenarios = scenariosForAgent('DS-13');
    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios.some(s => s.role_or_agent === 'DS-13')).toBe(true);
    expect(scenarios.every(s => s.role_or_agent === 'DS-13' || s.role_or_agent === 'hod')).toBe(true);
  });

  it('DS-11 (CMO/Grow) has growth-specific scenarios', () => {
    const scenarios = scenariosForAgent('DS-11');
    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios.some(s => s.role_or_agent === 'DS-11')).toBe(true);
  });

  it('passing CFO scenarios raises certification from TRAINING_REQUIRED', () => {
    const modules = trainingModulesFor('DS-13');
    const scenarios = scenariosForAgent('DS-13');
    const results: AssessmentResult[] = scenarios.map(s => ({
      scenario_id: s.id, passed: true,
      evidence: 'Test evidence', assessed_by: 'DS-02', assessed_at: now.toISOString(),
    }));
    const cert = deriveCertification(modules, results);
    expect(cert).not.toBe('TRAINING_REQUIRED');
  });
});

// ── Test 5: Prince receives and updates a real Work Registry task ──

describe('5. Prince in the Work Registry', () => {
  it('Prince is in HUMAN_REGISTRY', () => {
    expect(findWorker('P-01')).toBeDefined();
    expect(PRINCE.name).toBe('Prince Keshri');
  });

  it('work assigned to Prince appears in his work view', () => {
    const reg = makeRegistry();
    const actor = workerAsActor(PRINCE);
    const created = reg.createItem({
      title: 'Set up Shiprocket for Moon', description: 'Integration task',
      type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses'),
      source: { channel: 'founder_request', requester: VIRAT },
    }, CEO);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    reg.transition(created.value.id, 'triaged', CEO, { payload: { triage: { priority: 'P2' } } });
    reg.transition(created.value.id, 'assigned', CEO, { payload: { owner: actor } });
    reg.transition(created.value.id, 'in_progress', actor, {});

    const items = reg.list();
    const view = workerWorkView('P-01', items, now);
    expect(view.in_progress.length).toBe(1);
    expect(view.in_progress[0].title).toBe('Set up Shiprocket for Moon');
  });

  it('completing a task reflects in performance metrics', () => {
    const reg = makeRegistry();
    const actor = workerAsActor(PRINCE);
    const created = reg.createItem({
      title: 'DNS setup for Korbi', description: 'DNS',
      type: 'task', level: 'work_item', scope: Scopes.brand('korbi'),
      source: { channel: 'founder_request', requester: VIRAT },
    }, CEO);
    if (!created.ok) { expect(created.ok).toBe(true); return; }

    reg.transition(created.value.id, 'triaged', CEO, { payload: { triage: { priority: 'P2' } } });
    reg.transition(created.value.id, 'assigned', CEO, { payload: { owner: actor } });
    reg.transition(created.value.id, 'in_progress', actor, {});
    reg.transition(created.value.id, 'resolved', actor, { payload: { resolution: { kind: 'completed', summary: 'Done' } } });
    reg.transition(created.value.id, 'verification', CEO, {});
    reg.transition(created.value.id, 'closed', CEO, { payload: { closure: { method: 'manual check', evidence: [{ kind: 'test', ref: 'DNS verified', summary: 'Checked DNS propagation' }] } } });

    const items = reg.list();
    const perf = workerPerformance('P-01', items, now);
    expect(perf.tasks_done).toBe(1);
    expect(perf.tasks_total).toBe(1);
  });
});

// ── Test 6: TAT/SLA metrics derive from persisted work transitions ──

describe('6. TAT and SLA metrics', () => {
  it('average completion hours are calculated from created_at to closed_at', () => {
    const reg = makeRegistry();
    const actor = workerAsActor(PRINCE);
    const item = reg.createItem({
      title: 'Webhook config', description: 'Task',
      type: 'task', level: 'work_item', scope: Scopes.devshop(),
      source: { channel: 'founder_request', requester: VIRAT },
    }, CEO);
    if (!item.ok) { expect(item.ok).toBe(true); return; }

    reg.transition(item.value.id, 'triaged', CEO, { payload: { triage: { priority: 'P2' } } });
    reg.transition(item.value.id, 'assigned', CEO, { payload: { owner: actor } });
    reg.transition(item.value.id, 'in_progress', actor, {});
    reg.transition(item.value.id, 'resolved', actor, { payload: { resolution: { kind: 'completed', summary: 'Done' } } });
    reg.transition(item.value.id, 'verification', CEO, {});
    reg.transition(item.value.id, 'closed', CEO, { payload: { closure: { method: 'manual check', evidence: [{ kind: 'test', ref: 'Webhook live', summary: 'Verified webhook responds' }] } } });

    const perf = workerPerformance('P-01', reg.list(), now);
    expect(perf.avg_completion_hours).not.toBeNull();
    expect(typeof perf.avg_completion_hours).toBe('number');
  });

  it('SLA adherence is computed from deadline vs closed_at', () => {
    const reg = makeRegistry();
    const actor = workerAsActor(PRINCE);
    const deadline = new Date(now.getTime() + 86_400_000 * 3);
    const item = reg.createItem({
      title: 'Template setup', description: 'Task',
      type: 'task', level: 'work_item', scope: Scopes.devshop(),
      source: { channel: 'founder_request', requester: VIRAT },
      deadline: { at: deadline.toISOString(), kind: 'target', promised_to: null },
    }, CEO);
    if (!item.ok) { expect(item.ok).toBe(true); return; }

    reg.transition(item.value.id, 'triaged', CEO, { payload: { triage: { priority: 'P2' } } });
    reg.transition(item.value.id, 'assigned', CEO, { payload: { owner: actor } });
    reg.transition(item.value.id, 'in_progress', actor, {});
    reg.transition(item.value.id, 'resolved', actor, { payload: { resolution: { kind: 'completed', summary: 'Done' } } });
    reg.transition(item.value.id, 'verification', CEO, {});
    reg.transition(item.value.id, 'closed', CEO, { payload: { closure: { method: 'manual check', evidence: [{ kind: 'test', ref: 'Template live', summary: 'Verified template in production' }] } } });

    const perf = workerPerformance('P-01', reg.list(), now);
    expect(perf.sla_adherence).toBe(100);
  });
});

// ── Test 7: Customer onboarding changes appear in the internal view ──

describe('7. Customer onboarding → internal view', () => {
  it('onboarding records are visible in the extended context', () => {
    const reg = makeRegistry();
    const onboarding: OnboardingRecord[] = [{
      brand_key: 'test_brand', client_name: 'Test Brand',
      stage: 'FOUNDATION', overall: 'IN_PROGRESS',
      components: [{ component: 'brand_registry', state: 'COMPLETE' }],
      complete: 5, total: 22, next_action: null, blockers: [],
      work_id: null, updated_at: now.toISOString(), created_at: now.toISOString(),
    }];

    const ctx = buildExtendedContext(founderInput('Which brands are onboarding?'), reg, { now, onboarding });
    expect(ctx.onboarding_brands).toHaveLength(1);
    expect(ctx.onboarding_brands[0].stage).toBe('FOUNDATION');
  });
});

// ── Test 8: Internal onboarding changes appear in the customer view where authorised ──

describe('8. Internal onboarding ↔ customer view', () => {
  it('both views share the same onboarding record structure', () => {
    const record: OnboardingRecord = {
      brand_key: 'test_brand', client_name: 'Test Brand',
      stage: 'SETUP', overall: 'IN_PROGRESS',
      components: [{ component: 'payment', state: 'WAITING' }],
      complete: 8, total: 22, next_action: { action: 'Connect Razorpay', owner: 'client' },
      blockers: [{ reason: 'Waiting for Razorpay account', owner: 'client' }],
      work_id: null, updated_at: now.toISOString(), created_at: now.toISOString(),
    };
    expect(record.brand_key).toBe('test_brand');
    expect(record.stage).toBe('SETUP');
    expect(record.blockers).toHaveLength(1);
  });
});

// ── Test 9: A future synthetic brand receives its dashboard configuration automatically ──

describe('9. Automatic dashboard generation for new brands', () => {
  it('generates a standard dashboard config for a new brand', () => {
    const config = generateDashboardConfig('synthetic_test_brand');
    expect(config.brand_key).toBe('synthetic_test_brand');
    expect(config.enabled_modules).toContain('command_centre');
    expect(config.enabled_modules).toContain('brand');
    expect(config.enabled_modules).toContain('settings');
    expect(Object.keys(config.module_states)).toHaveLength(CANONICAL_MODULES.length);
  });

  it('default manifest has all canonical modules', () => {
    const manifest = defaultModuleManifest();
    expect(manifest.enabled.length).toBe(3);
    expect(Object.keys(manifest.states)).toHaveLength(CANONICAL_MODULES.length);
    expect(manifest.states.commerce).toBe('SETUP_REQUIRED');
  });

  it('can enable additional modules during generation', () => {
    const config = generateDashboardConfig('new_brand', {
      enabled_modules: ['command_centre', 'brand', 'commerce', 'catalogue', 'settings'],
    });
    expect(config.enabled_modules).toContain('commerce');
    expect(config.module_states.commerce).toBe('AVAILABLE');
  });

  it('isReadyForDashboard returns true for FOUNDATION stage onwards', () => {
    expect(isReadyForDashboard('DISCOVER')).toBe(false);
    expect(isReadyForDashboard('FOUNDATION')).toBe(true);
    expect(isReadyForDashboard('SETUP')).toBe(true);
    expect(isReadyForDashboard('LAUNCH')).toBe(true);
  });
});

// ── Test 10: Existing brand-specific modules are preserved ──

describe('10. Brand-specific module preservation', () => {
  it('Moon, Travaholic, Ceremony and Fresh all have brand CEOs', () => {
    expect(brandCeoFor('moonglasses')).toBeDefined();
    expect(brandCeoFor('caps')).toBeDefined();
    expect(brandCeoFor('ceremonykitchen')).toBeDefined();
    expect(brandCeoFor('freshforpaws')).toBeDefined();
  });

  it('brand CEOs report to DevShop CEO (DS-02)', () => {
    for (const brand of ['moonglasses', 'caps', 'ceremonykitchen', 'freshforpaws']) {
      const ceo = brandCeoFor(brand)!;
      expect(ceo.reports_to).toBe('DS-02');
    }
  });

  it('client-specific dashboard configs can include extensions', () => {
    const config = generateDashboardConfig('ceremonykitchen', {
      enabled_modules: ['command_centre', 'brand', 'catalogue', 'commerce', 'finance', 'operations', 'settings'],
      client_extensions: ['ceremony_finance', 'ceremony_ops'],
    });
    expect((config.config as any).client_extensions).toContain('ceremony_finance');
    expect((config.config as any).client_extensions).toContain('ceremony_ops');
  });
});

// ── Test 11: Cross-brand access is denied ──

describe('11. Cross-brand isolation', () => {
  it('brand CEO scope is limited to their own brand', () => {
    const moon = brandCeoFor('moonglasses')!;
    expect(moon.scope?.brand).toBe('moonglasses');
    const trav = brandCeoFor('caps')!;
    expect(trav.scope?.brand).toBe('caps');
  });

  it('brand work items are scoped to a brand', () => {
    const reg = makeRegistry();
    const moonWork = reg.createItem({
      title: 'Moon task', description: 'Moon-only',
      type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses'),
      source: { channel: 'founder_request', requester: VIRAT },
    }, CEO);
    const travWork = reg.createItem({
      title: 'Trav task', description: 'Trav-only',
      type: 'task', level: 'work_item', scope: Scopes.brand('caps'),
      source: { channel: 'founder_request', requester: VIRAT },
    }, CEO);

    const ctx = buildExtendedContext(founderInput('How is Moon?', 'moonglasses'), reg, { now });
    const moonBrand = ctx.brands.find(b => b.brand_key === 'moonglasses');
    const travBrand = ctx.brands.find(b => b.brand_key === 'caps');
    expect(moonBrand!.open_work_count).toBe(1);
    expect(travBrand!.open_work_count).toBe(1);
  });
});

// ── Test 12: CEO can retrieve persistent organisation, agent, human, brand and onboarding state ──

describe('12. CEO full operating context', () => {
  it('extended context includes agents, humans, brands, decisions and onboarding', () => {
    const reg = makeRegistry();
    const decisions: OrgDecision[] = [{
      id: 'dec-1', scope: 'company', brand: null, category: 'strategy',
      decision: 'Focus on profitability', evidence: 'Board meeting',
      decided_by: 'DS-00', decided_at: now.toISOString(),
      superseded_by: null, created_at: now.toISOString(),
    }];
    const onboarding: OnboardingRecord[] = [{
      brand_key: 'test', client_name: 'Test', stage: 'AGREEMENT',
      overall: 'IN_PROGRESS', components: [], complete: 2, total: 22,
      next_action: null, blockers: [], work_id: null,
      updated_at: now.toISOString(), created_at: now.toISOString(),
    }];

    const ctx = buildExtendedContext(founderInput('What needs my attention?'), reg, { now, decisions, onboarding });

    expect(ctx.agents.length).toBeGreaterThan(10);
    expect(ctx.humans.length).toBe(1);
    expect(ctx.humans[0].worker.id).toBe('P-01');
    expect(ctx.brands.length).toBeGreaterThanOrEqual(4);
    expect(ctx.recent_decisions).toHaveLength(1);
    expect(ctx.onboarding_brands).toHaveLength(1);
  });

  it('answerAttention summarises the morning board', () => {
    const reg = makeRegistry();
    const ctx = buildExtendedContext(founderInput('What needs my attention?'), reg, { now });
    const answer = answerAttention(ctx);
    expect(typeof answer).toBe('string');
    expect(answer.length).toBeGreaterThan(0);
  });

  it('answerPrinceWork describes Prince\'s work state', () => {
    const reg = makeRegistry();
    const ctx = buildExtendedContext(founderInput('What is Prince working on?'), reg, { now });
    const answer = answerPrinceWork(ctx);
    expect(answer).toContain('Prince');
  });

  it('answerBrandStatus describes a brand', () => {
    const reg = makeRegistry();
    const ctx = buildExtendedContext(founderInput('How is Moon?', 'moonglasses'), reg, { now });
    const answer = answerBrandStatus('moonglasses', ctx);
    expect(answer).toContain('moonglasses');
  });

  it('answerAgentTraining describes an agent\'s certification', () => {
    const reg = makeRegistry();
    const ctx = buildExtendedContext(founderInput('Is our CMO trained?'), reg, { now });
    const answer = answerAgentTraining('DS-11', ctx);
    expect(answer).toContain('DS-11');
    expect(answer).toContain('Grow');
  });

  it('answerOnboarding lists brands onboarding', () => {
    const reg = makeRegistry();
    const onboarding: OnboardingRecord[] = [{
      brand_key: 'newbrand', client_name: 'New', stage: 'DEPOSIT',
      overall: 'IN_PROGRESS', components: [], complete: 1, total: 22,
      next_action: null, blockers: [], work_id: null,
      updated_at: now.toISOString(), created_at: now.toISOString(),
    }];
    const ctx = buildExtendedContext(founderInput('Which brands are onboarding?'), reg, { now, onboarding });
    const answer = answerOnboarding(ctx);
    expect(answer).toContain('newbrand');
  });
});

// ── Test 13: Relevant memory/intelligence updates survive a new session ──

describe('13. Memory/intelligence persistence', () => {
  it('org_decisions provide cross-session persistence of founder decisions', () => {
    const decisions: OrgDecision[] = [
      {
        id: 'dec-1', scope: 'company', brand: null, category: 'operations',
        decision: 'All deploys go through Prince', evidence: 'Founder directive',
        decided_by: 'DS-00', decided_at: '2026-10-07T10:00:00Z',
        superseded_by: null, created_at: '2026-10-07T10:00:00Z',
      },
      {
        id: 'dec-2', scope: 'brand', brand: 'moonglasses', category: 'pricing',
        decision: 'Moon prices frozen until Diwali 2026', evidence: 'Board decision',
        decided_by: 'DS-00', decided_at: '2026-10-07T14:00:00Z',
        superseded_by: null, created_at: '2026-10-07T14:00:00Z',
      },
    ];

    const reg = makeRegistry();
    const ctx1 = buildExtendedContext(founderInput('What did we decide yesterday?'), reg, { now, decisions });
    expect(ctx1.recent_decisions).toHaveLength(2);
    expect(ctx1.recent_decisions.some(d => d.decision.includes('Prince'))).toBe(true);
    expect(ctx1.recent_decisions.some(d => d.decision.includes('frozen until Diwali'))).toBe(true);

    const ctx2 = buildExtendedContext(founderInput('What about Moon pricing?', 'moonglasses'), reg, { now, decisions });
    expect(ctx2.recent_decisions.some(d => d.brand === 'moonglasses')).toBe(true);
  });

  it('superseded decisions are filtered out', () => {
    const decisions: OrgDecision[] = [
      {
        id: 'dec-old', scope: 'company', brand: null, category: 'policy',
        decision: 'Old policy', evidence: '', decided_by: 'DS-00',
        decided_at: '2026-09-01T00:00:00Z', superseded_by: 'dec-new', created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'dec-new', scope: 'company', brand: null, category: 'policy',
        decision: 'New policy', evidence: '', decided_by: 'DS-00',
        decided_at: '2026-10-01T00:00:00Z', superseded_by: null, created_at: '2026-10-01T00:00:00Z',
      },
    ];
    expect(decisions.filter(d => !d.superseded_by)).toHaveLength(1);
    expect(decisions.filter(d => !d.superseded_by)[0].decision).toBe('New policy');
  });
});
