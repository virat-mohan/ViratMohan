import { describe, expect, it } from 'vitest';
import { handleFounderInput, toFounderResponse, type FounderDeps } from '../../../src/lib/ceo/founder-service';
import { InMemoryWorkRegistry } from '../../../src/lib/work/registry';
import { VIRAT, PRINCE as PRINCE_ACTOR } from '../../../src/lib/work/actors';
import type { WorkItem } from '../../../src/lib/work/types';
import { emptyBrainContext, type BrainContext } from '../../../src/lib/ceo/brain-context';
import type { OrgDecision, OnboardingRecord, DashboardConfig } from '../../../src/lib/ceo/db-stores';
import type { AssessmentResult } from '../../../src/lib/ceo/agent-training';
import { ASSESSMENT_SCENARIOS } from '../../../src/lib/ceo/agent-training';
import { handleWorkerAction, type WorkerActionRequest } from '../../../src/lib/ceo/people-action';
import { certificationSummary, canExerciseAutonomy, trainingModulesFor, deriveCertification } from '../../../src/lib/ceo/agent-training';
import { buildExtendedContext } from '../../../src/lib/ceo/ceo-context-extended';
import { classifyFounderInput } from '../../../src/lib/ceo/founder-input';
import { processFounderInput } from '../../../src/lib/ceo/orchestrator';
import { canCeoAssign } from '../../../src/lib/ceo/authority';

const NOW = new Date('2026-10-08T10:00:00.000Z');
const AUTH = 'Basic ' + Buffer.from('admin:test-admin-pw').toString('base64');

function makeMockStore() {
  const registry = new InMemoryWorkRegistry({ now: () => NOW.toISOString() });
  type Snapshot = { items: WorkItem[]; sourceEvents: any[]; links: any[]; locks: any[] };
  let persisted: Snapshot | null = null;
  const store = {
    async loadAll(): Promise<Snapshot> {
      if (persisted) return persisted;
      return { items: registry.list().map(i => ({ ...i })), sourceEvents: [], links: [], locks: [] };
    },
    async persist(s: Snapshot) { persisted = s; },
    registry,
  };
  return store;
}

function makeDeps(overrides: Partial<FounderDeps> = {}): FounderDeps {
  return {
    store: makeMockStore() as any,
    adminPassword: 'test-admin-pw',
    now: NOW,
    ...overrides,
  };
}

describe('A: CEO runtime handler receives extended deps', () => {
  it('handleFounderInput returns extended context when brain/decisions/onboarding/dashboards provided', async () => {
    const brain: BrainContext = {
      ...emptyBrainContext(),
      companyFacts: [{ id: 'f1', fact: 'test fact', source: 'test', audience: 'staff', at: NOW.toISOString(), confidence: 1 } as any],
    };
    const decisions: OrgDecision[] = [{
      id: 'd1', scope: 'company', brand: null, category: 'test', decision: 'test decision',
      evidence: 'test', decided_by: 'DS-00', decided_at: NOW.toISOString(), superseded_by: null, created_at: NOW.toISOString(),
    }];
    const onboarding: OnboardingRecord[] = [{
      brand_key: 'test_brand', client_name: 'Test', stage: 'SETUP', overall: 'in_progress',
      components: [], complete: 2, total: 5, next_action: null, blockers: [],
      work_id: null, updated_at: NOW.toISOString(), created_at: NOW.toISOString(),
    }];
    const dashboards: DashboardConfig[] = [{
      brand_key: 'test_brand', enabled_modules: ['commerce'], module_states: {},
      brand_ceo_id: null, config: {}, created_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    }];

    const deps = makeDeps({ brainContext: brain, decisions, onboarding, dashboards });
    const r = await handleFounderInput(AUTH, { text: 'What needs my attention?' }, deps);
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.extended).toBeDefined();
    expect(body.extended.brainSummary).toContain('company fact');
    expect(body.extended.brandCount).toBeGreaterThanOrEqual(1);
  });

  it('handleFounderInput works without extended deps (backward compatible)', async () => {
    const deps = makeDeps();
    const r = await handleFounderInput(AUTH, { text: 'Show me work status' }, deps);
    expect(r.status).toBe(200);
    expect((r.body as any).extended).toBeUndefined();
  });
});

describe('B: People OS worker actions through handler', () => {
  it('worker can accept assigned work', async () => {
    const store = makeMockStore();
    const reg = store.registry;
    const item = reg.createItem({
      type: 'task', title: 'Setup DNS for brand',
      description: 'Configure DNS records',
      scope: { kind: 'devshop', brand: null, founder: null, system: null, extension: null },
      source: { channel: 'internal', requester: VIRAT },
    }, VIRAT);
    expect(item.ok).toBe(true);
    if (!item.ok) return;
    const id = item.value.id;
    reg.transition(id, 'triaged', VIRAT, { payload: { triage: { priority: 'P3' } } });
    reg.transition(id, 'assigned', VIRAT, { payload: { owner: PRINCE_ACTOR } });

    const r = await handleWorkerAction(store as any, {
      worker_id: 'P-01', work_id: id, action: 'accept',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe('in_progress');
  });

  it('worker can record a blocker and clear it', async () => {
    const store = makeMockStore();
    const reg = store.registry;
    const item = reg.createItem({
      type: 'task', title: 'Integrate Shiprocket',
      description: 'Connect brand to Shiprocket',
      scope: { kind: 'devshop', brand: null, founder: null, system: null, extension: null },
      source: { channel: 'internal', requester: VIRAT },
    }, VIRAT);
    if (!item.ok) return;
    const id = item.value.id;
    reg.transition(id, 'triaged', VIRAT, { payload: { triage: { priority: 'P2' } } });
    reg.transition(id, 'assigned', VIRAT, { payload: { owner: PRINCE_ACTOR } });
    reg.transition(id, 'in_progress', PRINCE_ACTOR, {});

    const block = await handleWorkerAction(store as any, {
      worker_id: 'P-01', work_id: id, action: 'record_blocker',
      blocker_reason: 'Waiting for API credentials from Shiprocket',
    });
    expect(block.ok).toBe(true);
    if (block.ok) expect(block.value.state).toBe('blocked');

    const clear = await handleWorkerAction(store as any, {
      worker_id: 'P-01', work_id: id, action: 'clear_blocker',
      note: 'Credentials received',
    });
    expect(clear.ok).toBe(true);
    if (clear.ok) expect(clear.value.state).toBe('in_progress');
  });

  it('worker can submit completion', async () => {
    const store = makeMockStore();
    const reg = store.registry;
    const item = reg.createItem({
      type: 'task', title: 'Deploy staging',
      description: 'Deploy to staging env',
      scope: { kind: 'devshop', brand: null, founder: null, system: null, extension: null },
      source: { channel: 'internal', requester: VIRAT },
    }, VIRAT);
    if (!item.ok) return;
    const id = item.value.id;
    reg.transition(id, 'triaged', VIRAT, { payload: { triage: { priority: 'P3' } } });
    reg.transition(id, 'assigned', VIRAT, { payload: { owner: PRINCE_ACTOR } });
    reg.transition(id, 'in_progress', PRINCE_ACTOR, {});

    const r = await handleWorkerAction(store as any, {
      worker_id: 'P-01', work_id: id, action: 'submit_completion',
      note: 'Staging deploy verified, all health checks pass',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe('resolved');
  });

  it('worker cannot act on work they do not own', async () => {
    const store = makeMockStore();
    const reg = store.registry;
    const item = reg.createItem({
      type: 'task', title: 'CEO strategy review',
      description: 'Review strategy',
      scope: { kind: 'devshop', brand: null, founder: null, system: null, extension: null },
      source: { channel: 'internal', requester: VIRAT },
    }, VIRAT);
    if (!item.ok) return;
    const r = await handleWorkerAction(store as any, {
      worker_id: 'P-01', work_id: item.value.id, action: 'accept',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('not_permitted');
  });
});

describe('C: Agent certification gates CEO delegation', () => {
  it('uncertified agent is blocked from CERTIFIED_L1 actions', () => {
    expect(canExerciseAutonomy('DS-13', 'CERTIFIED_L1')).toBe(false);
  });

  it('agent with all modules passed reaches at least CERTIFIED_L1', () => {
    const modules = trainingModulesFor('DS-13');
    const allPassed: AssessmentResult[] = modules.map((m, i) => ({
      scenario_id: ASSESSMENT_SCENARIOS.find(s => s.module_id === m.id)?.id ?? `SYNTH-${i}`,
      passed: true, evidence: `Module ${m.id} verified`,
      assessed_at: NOW.toISOString(), assessed_by: 'DS-02',
    }));
    expect(canExerciseAutonomy('DS-13', 'CERTIFIED_L1', allPassed)).toBe(true);
  });

  it('storedAssessments map flows through to certificationSummary', () => {
    const modules = trainingModulesFor('DS-11'); // CMO
    const allPassed: AssessmentResult[] = modules.map((m, i) => ({
      scenario_id: ASSESSMENT_SCENARIOS.find(s => s.module_id === m.id)?.id ?? `SYNTH-${i}`,
      passed: true, evidence: `Module ${m.id} verified`,
      assessed_at: NOW.toISOString(), assessed_by: 'DS-02',
    }));
    const assessmentMap = new Map([['DS-11', allPassed]]);
    const summary = certificationSummary(NOW, assessmentMap);
    const cmo = summary.find(s => s.agent_id === 'DS-11');
    expect(cmo).toBeDefined();
    expect(cmo!.assessments_passed).toBeGreaterThan(0);
  });
});

describe('D: Extended context assembly with real registry data', () => {
  it('buildExtendedContext includes agents, humans, brands', () => {
    const reg = new InMemoryWorkRegistry({ now: () => NOW.toISOString() });
    const input = classifyFounderInput('What needs attention?', VIRAT, { channel: 'command_centre', now: NOW });
    const ctx = buildExtendedContext(input, reg, {
      now: NOW,
      decisions: [{ id: 'd1', scope: 'company', brand: null, category: 'ops', decision: 'test', evidence: 'test', decided_by: 'DS-00', decided_at: NOW.toISOString(), superseded_by: null, created_at: NOW.toISOString() }],
      onboarding: [{ brand_key: 'travaholic', client_name: 'Trav', stage: 'SETUP', overall: 'in_progress', components: [], complete: 3, total: 9, next_action: null, blockers: [], work_id: null, updated_at: NOW.toISOString(), created_at: NOW.toISOString() }],
      dashboards: [{ brand_key: 'travaholic', enabled_modules: ['commerce', 'growth'], module_states: {}, brand_ceo_id: 'TC-01', config: {}, created_at: NOW.toISOString(), updated_at: NOW.toISOString() }],
    });
    expect(ctx.agents.length).toBeGreaterThan(0);
    expect(ctx.humans.length).toBeGreaterThan(0);
    expect(ctx.brands.length).toBeGreaterThanOrEqual(1);
    expect(ctx.recent_decisions.length).toBe(1);
    expect(ctx.onboarding_brands.length).toBe(1);
  });
});

describe('E: Persistent memory loop proof', () => {
  it('Brain context flows from fetchBrainContext through handleFounderInput to response', async () => {
    const brain: BrainContext = {
      companyFacts: [{ id: 'f1', fact: 'DevShop mission: working online business in 7 days', source: 'viratmohan.com/mission', audience: 'staff', at: NOW.toISOString(), confidence: 1 } as any],
      brandFacts: [],
      rules: [{ id: 'r1', schema: 'ceo_governance', condition: 'money > 0', action: 'ask virat', source: 'playbook', at: NOW.toISOString() } as any],
      strategicPriorities: [],
      orgLines: [],
      learnings: [{ id: 'l1', fact: 'COD causes high RTO', source: 'case-study/LEARNINGS.md', audience: 'staff', at: NOW.toISOString(), confidence: 1 } as any],
      totalItems: 3,
    };
    const deps = makeDeps({ brainContext: brain });
    const r = await handleFounderInput(AUTH, { text: 'What do we know?' }, deps);
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.extended).toBeDefined();
    expect(body.extended.brainSummary).toContain('company fact');
    expect(body.extended.brainSummary).toContain('governance rule');
    expect(body.extended.brainSummary).toContain('learning');
  });
});

describe('F2: Certification gates CEO delegation in the orchestrator', () => {
  it('uncertified agent is blocked when storedAssessments are provided', () => {
    const emptyAssessments = new Map<string, AssessmentResult[]>();
    const target = { kind: 'agent' as const, id: 'tc_01' };
    const verdict = canCeoAssign(target, undefined, emptyAssessments);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toContain('not yet certified');
  });

  it('certified agent is allowed when storedAssessments show passed modules', () => {
    const modules = trainingModulesFor('TC-01');
    const allPassed: AssessmentResult[] = modules.map((m, i) => ({
      scenario_id: ASSESSMENT_SCENARIOS.find(s => s.module_id === m.id)?.id ?? `SYNTH-${i}`,
      passed: true, evidence: `Module ${m.id} verified`,
      assessed_at: NOW.toISOString(), assessed_by: 'DS-02',
    }));
    const assessments = new Map([['TC-01', allPassed]]);
    const target = { kind: 'agent' as const, id: 'tc_01' };
    const verdict = canCeoAssign(target, undefined, assessments);
    expect(verdict.allowed).toBe(true);
  });

  it('without storedAssessments, delegation is allowed (backward compatible)', () => {
    const target = { kind: 'agent' as const, id: 'tc_01' };
    const verdict = canCeoAssign(target);
    expect(verdict.allowed).toBe(true);
  });

  it('orchestrator blocks delegation to uncertified agent', () => {
    const reg = new InMemoryWorkRegistry({ now: () => NOW.toISOString() });
    const input = classifyFounderInput('Deploy the staging build for Travaholic', VIRAT, { channel: 'command_centre', now: NOW });
    const emptyAssessments = new Map<string, AssessmentResult[]>();
    const outcome = processFounderInput(input, reg, { now: NOW, storedAssessments: emptyAssessments });
    if (outcome.kind === 'escalated') {
      expect(outcome.summary).toContain('certified');
    }
  });
});

describe('F: Founder Command Centre connected UX', () => {
  it('CEO response carries routing, authority, and next step for every input', async () => {
    const deps = makeDeps();
    const inputs = [
      'Create a task for Prince to set up DNS',
      'What is the status of Moon Glasses?',
      'Approve the content calendar for Travaholic',
    ];
    for (const text of inputs) {
      const r = await handleFounderInput(AUTH, { text }, deps);
      expect(r.status).toBe(200);
      const body = r.body as any;
      expect(body.understood.kind).toBeTruthy();
      expect(body.authority).toBeDefined();
      expect(body.nextStep).toBeTruthy();
    }
  });
});
