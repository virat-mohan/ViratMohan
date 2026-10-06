import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROCESS_EFFICIENCY_ID, PROCESS_EFFICIENCY_AGENT, PROCESS_EFFICIENCY_PASSPORT,
  FUNCTIONS, IMPROVEMENT_CATEGORIES, IMPROVEMENT_STATUSES, IMPROVEMENT_SIGNAL_SOURCES,
  detectRecurrence, RECURRENCE_THRESHOLD, validateRootCause,
  classifySignalSource, classifyImprovementCategory, shouldCreateImprovement,
  requiresCeoReview, requiresMyohoReview, requiresFounderApproval,
  resolveGovernance, validateChangeProposal, canTransition, requiresApprovalForTransition,
} from '../../../src/lib/improvement';
import type { Improvement, ChangeProposal, RootCause, RecurrenceRecord } from '../../../src/lib/improvement';
import type { WorkItem } from '../../../src/lib/work/types';
import { findAgent, AGENT_REGISTRY } from '../../../src/lib/ceo/types';
import { AUTOMATION_LEVELS } from '../../../src/lib/amc';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeImprovement(overrides: Partial<Improvement> = {}): Improvement {
  return {
    id: 'imp-1', ref: 'I-0001', work_id: 'w-1', category: 'process', status: 'detected',
    signal_source: 'incident', title: 'Test improvement', description: 'Test',
    priority: 'P3', owner: { kind: 'agent', id: 'DS-17' }, brand: null,
    root_cause: null, recurrence: null, change_proposal: null,
    benefits: [], before_after: [], ptm: null, learning: null,
    prevention: [], verification: null,
    created_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z', closed_at: null,
    ...overrides,
  };
}

function makeChangeProposal(overrides: Partial<ChangeProposal> = {}): ChangeProposal {
  return {
    id: 'cp-1', improvement_id: 'imp-1', title: 'Fix process', description: 'Change the thing',
    category: 'process', before: 'Manual', after: 'Automated', risk: 'low', reversible: true,
    affected_systems: ['retail-os'], affected_agents: [], affected_brands: [],
    proposed_by: { kind: 'agent', id: 'DS-17' }, proposed_at: '2026-10-06T00:00:00Z',
    approval: { required_from: 'ceo', decision: 'pending', decided_by: null, decided_at: null, reason: null },
    ...overrides,
  };
}

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'w-1', ref: 'W-0001', level: 'work_item', parent_id: null, type: 'incident',
    title: 'Test incident', description: 'Something broke', scope: { kind: 'devshop', brand: null, founder: null, system: null, extension: null },
    source: { channel: 'agent_detection', requester: { kind: 'agent', id: 'DS-10' } },
    priority: 'P2', priority_factors: null, priority_reason: null, state: 'closed',
    held_from: null, owner: { kind: 'agent', id: 'DS-02' }, supporting: [], observers: [],
    created_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z',
    deadline: null, customer_impact: null, revenue_profit_risk: null, security_risk: null,
    evidence: [], waiting: null, blocked: null, approval: null, escalations: [],
    repo_scope: null, incident: { diagnosis: 'root cause found', tests: [], result: 'fixed', cost: null, revenue_impact: null, decision: null, prevention: [{ action: 'Add guard', work_id: null }] },
    resolution: null, closure: null,
    learning: { lesson: 'Check before deploy', reference: null, rule_added: true },
    closed_at: '2026-10-06T01:00:00Z', reopen_count: 0, merged_into: null, source_event_ids: [], events: [],
    ...overrides,
  } as WorkItem;
}

// ── 1. Process Efficiency Agent ─────────────────────────────────────────

describe('Process Efficiency Agent (DS-17)', () => {
  it('test 1: is registered in the agent registry', () => {
    const agent = findAgent(PROCESS_EFFICIENCY_ID);
    assert.ok(agent, 'DS-17 must be in AGENT_REGISTRY');
    assert.equal(agent.name, 'Improve');
    assert.equal(agent.role, 'specialist');
  });

  it('test 2: reports to DS-02 Dev (CEO)', () => {
    const agent = findAgent(PROCESS_EFFICIENCY_ID)!;
    assert.equal(agent.reports_to, 'DS-02');
    assert.equal(PROCESS_EFFICIENCY_PASSPORT.reportsTo, 'DS-02');
  });

  it('test 3: has correct purpose and capabilities', () => {
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.purpose.includes('improvement'));
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.canDo.includes('detect-improvement-signals'));
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.canDo.includes('perform-root-cause-analysis'));
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.canDo.includes('propose-changes'));
  });

  it('test 4: cannot approve changes or modify policies', () => {
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.cannotDo.includes('approve-changes'));
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.cannotDo.includes('modify-brand-foundation'));
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.cannotDo.includes('modify-model-policy'));
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.cannotDo.includes('override-founder'));
    assert.ok(PROCESS_EFFICIENCY_PASSPORT.cannotDo.includes('assign-prince-work'));
  });
});

// ── 2. Improvement object and types ─────────────────────────────────────

describe('Improvement types and vocabulary', () => {
  it('test 5: canonical improvement categories exist', () => {
    assert.ok(IMPROVEMENT_CATEGORIES.includes('process'));
    assert.ok(IMPROVEMENT_CATEGORIES.includes('agent'));
    assert.ok(IMPROVEMENT_CATEGORIES.includes('model'));
    assert.ok(IMPROVEMENT_CATEGORIES.includes('human'));
    assert.ok(IMPROVEMENT_CATEGORIES.includes('brand'));
    assert.ok(IMPROVEMENT_CATEGORIES.includes('visual'));
    assert.ok(IMPROVEMENT_CATEGORIES.includes('security'));
    assert.equal(IMPROVEMENT_CATEGORIES.length, 9);
  });

  it('test 6: improvement lifecycle statuses follow DETECT→…→CLOSED', () => {
    assert.deepEqual([...IMPROVEMENT_STATUSES], [
      'detected', 'analysed', 'root_caused', 'proposed', 'approved',
      'implementing', 'verifying', 'standardised', 'closed',
    ]);
  });

  it('test 7: signal sources cover all detection channels', () => {
    assert.ok(IMPROVEMENT_SIGNAL_SOURCES.includes('incident'));
    assert.ok(IMPROVEMENT_SIGNAL_SOURCES.includes('recurring_incident'));
    assert.ok(IMPROVEMENT_SIGNAL_SOURCES.includes('health_check'));
    assert.ok(IMPROVEMENT_SIGNAL_SOURCES.includes('agent_detection'));
    assert.ok(IMPROVEMENT_SIGNAL_SOURCES.includes('visual_review'));
    assert.ok(IMPROVEMENT_SIGNAL_SOURCES.includes('customer_feedback'));
  });

  it('test 8: functions cover all organisational areas', () => {
    assert.ok(FUNCTIONS.includes('operations'));
    assert.ok(FUNCTIONS.includes('growth'));
    assert.ok(FUNCTIONS.includes('finance'));
    assert.ok(FUNCTIONS.includes('quality'));
    assert.ok(FUNCTIONS.includes('visual'));
    assert.ok(FUNCTIONS.includes('brand'));
  });
});

// ── 3. PTM and automation classification ────────────────────────────────

describe('PTM and automation classification', () => {
  it('test 9: reuses AutomationLevel from AMC system', () => {
    assert.ok(AUTOMATION_LEVELS.includes('fully_automated'));
    assert.ok(AUTOMATION_LEVELS.includes('human_in_loop'));
    assert.ok(AUTOMATION_LEVELS.includes('human_reviewed'));
    assert.ok(AUTOMATION_LEVELS.includes('advisory_only'));
  });
});

// ── 4. Recurrence detection ─────────────────────────────────────────────

describe('Recurrence detection', () => {
  it('test 10: detects recurrence at threshold', () => {
    const result = detectRecurrence({
      brand: 'caps', fingerprint: 'checkout-fail',
      work_ids: ['w-1', 'w-2'],
      timestamps: ['2026-10-01T00:00:00Z', '2026-10-04T00:00:00Z'],
    });
    assert.ok(result);
    assert.equal(result.occurrences, 2);
    assert.equal(result.pattern, 'checkout-fail');
    assert.equal(result.interval_days_avg, 3);
  });

  it('test 11: does not flag below threshold', () => {
    const result = detectRecurrence({
      brand: 'caps', fingerprint: 'one-off',
      work_ids: ['w-1'], timestamps: ['2026-10-01T00:00:00Z'],
    });
    assert.equal(result, null);
  });

  it('test 12: calculates average interval', () => {
    const result = detectRecurrence({
      brand: null, fingerprint: 'repeat',
      work_ids: ['w-1', 'w-2', 'w-3'],
      timestamps: ['2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z', '2026-10-09T00:00:00Z'],
    });
    assert.ok(result);
    assert.equal(result.interval_days_avg, 4);
  });
});

// ── 5. Root cause analysis ──────────────────────────────────────────────

describe('Root cause analysis', () => {
  it('test 13: validates a complete root cause', () => {
    const rc: RootCause = {
      summary: 'Missing validation', method: 'five_whys', depth: 3,
      evidence_ids: ['ev-1'], contributing_factors: ['time pressure'],
    };
    assert.equal(validateRootCause(rc).valid, true);
  });

  it('test 14: rejects incomplete root cause', () => {
    const rc: RootCause = {
      summary: '', method: 'direct', depth: 0,
      evidence_ids: [], contributing_factors: [],
    };
    const result = validateRootCause(rc);
    assert.equal(result.valid, false);
    assert.ok(result.missing.length >= 2);
  });
});

// ── 6. Signal classification ────────────────────────────────────────────

describe('Signal classification', () => {
  it('test 15: classifies incident signal source', () => {
    const item = makeWorkItem({ type: 'incident' });
    assert.equal(classifySignalSource(item), 'incident');
  });

  it('test 16: classifies alert as health_check', () => {
    const item = makeWorkItem({ type: 'alert', incident: null });
    assert.equal(classifySignalSource(item), 'health_check');
  });

  it('test 17: classifies support as customer_feedback', () => {
    const item = makeWorkItem({ type: 'support', incident: null });
    assert.equal(classifySignalSource(item), 'customer_feedback');
  });

  it('test 18: classifies improvement category from description', () => {
    assert.equal(classifyImprovementCategory('Brand voice drift on Instagram'), 'brand');
    assert.equal(classifyImprovementCategory('Model routing inefficiency'), 'model');
    assert.equal(classifyImprovementCategory('Visual design quality issue'), 'visual');
    assert.equal(classifyImprovementCategory('Security vulnerability in auth'), 'security');
    assert.equal(classifyImprovementCategory('Shipping process delay'), 'process');
  });
});

// ── 7. Work Registry integration ────────────────────────────────────────

describe('Work Registry integration', () => {
  it('test 19: improvement references a Work item (not a duplicate)', () => {
    const imp = makeImprovement();
    assert.ok(imp.work_id, 'improvement must reference a work_id');
    assert.equal(imp.work_id, 'w-1');
  });

  it('test 20: shouldCreateImprovement from incident with learning + prevention', () => {
    const item = makeWorkItem();
    assert.equal(shouldCreateImprovement(item), true);
  });

  it('test 21: shouldCreateImprovement is false without learning', () => {
    const item = makeWorkItem({ learning: null });
    assert.equal(shouldCreateImprovement(item), false);
  });
});

// ── 8. Governance ───────────────────────────────────────────────────────

describe('Improvement governance', () => {
  it('test 22: CEO review for model/security/platform categories', () => {
    assert.equal(requiresCeoReview(makeImprovement({ category: 'model' })), true);
    assert.equal(requiresCeoReview(makeImprovement({ category: 'security' })), true);
    assert.equal(requiresCeoReview(makeImprovement({ category: 'platform' })), true);
  });

  it('test 23: CEO review for P0/P1 priorities', () => {
    assert.equal(requiresCeoReview(makeImprovement({ priority: 'P0' })), true);
    assert.equal(requiresCeoReview(makeImprovement({ priority: 'P1' })), true);
    assert.equal(requiresCeoReview(makeImprovement({ priority: 'P4' })), false);
  });

  it('test 24: Myoho review for brand/visual categories', () => {
    assert.equal(requiresMyohoReview(makeImprovement({ category: 'brand' })), true);
    assert.equal(requiresMyohoReview(makeImprovement({ category: 'visual' })), true);
    assert.equal(requiresMyohoReview(makeImprovement({ category: 'process' })), false);
  });

  it('test 25: Founder approval for irreversible changes', () => {
    const imp = makeImprovement({ change_proposal: makeChangeProposal({ reversible: false }) });
    assert.equal(requiresFounderApproval(imp), true);
  });

  it('test 26: routine improvement needs no special governance', () => {
    const gov = resolveGovernance(makeImprovement({ category: 'process', priority: 'P4' }));
    assert.equal(gov.requiresCeoReview, false);
    assert.equal(gov.requiresMyohoReview, false);
    assert.equal(gov.requiresFounderApproval, false);
    assert.ok(gov.reason.includes('routine'));
  });
});

// ── 9. Change proposal ─────────────────────────────────────────────────

describe('Change proposal', () => {
  it('test 27: validates a complete change proposal', () => {
    const result = validateChangeProposal(makeChangeProposal());
    assert.equal(result.valid, true);
  });

  it('test 28: rejects incomplete change proposal', () => {
    const result = validateChangeProposal(makeChangeProposal({ title: '', before: '', affected_systems: [] }));
    assert.equal(result.valid, false);
    assert.ok(result.missing.includes('title'));
    assert.ok(result.missing.includes('before'));
    assert.ok(result.missing.includes('affected_systems'));
  });
});

// ── 10. Status transitions ──────────────────────────────────────────────

describe('Improvement lifecycle transitions', () => {
  it('test 29: valid transitions follow the lifecycle', () => {
    assert.equal(canTransition('detected', 'analysed'), true);
    assert.equal(canTransition('analysed', 'root_caused'), true);
    assert.equal(canTransition('root_caused', 'proposed'), true);
    assert.equal(canTransition('proposed', 'approved'), true);
    assert.equal(canTransition('approved', 'implementing'), true);
    assert.equal(canTransition('implementing', 'verifying'), true);
    assert.equal(canTransition('verifying', 'standardised'), true);
    assert.equal(canTransition('standardised', 'closed'), true);
  });

  it('test 30: invalid transitions are rejected', () => {
    assert.equal(canTransition('detected', 'closed'), false);
    assert.equal(canTransition('closed', 'detected'), false);
    assert.equal(canTransition('proposed', 'implementing'), false);
  });

  it('test 31: approval required for implementing', () => {
    assert.equal(requiresApprovalForTransition('implementing'), true);
    assert.equal(requiresApprovalForTransition('approved'), true);
    assert.equal(requiresApprovalForTransition('analysed'), false);
  });
});

// ── 11. Before / after and benefits ─────────────────────────────────────

describe('Before/after and benefit tracking', () => {
  it('test 32: improvement carries before/after evidence', () => {
    const imp = makeImprovement({
      before_after: [{ dimension: 'time_per_task', before: '30 min', after: '5 min', measured: true }],
      benefits: [{ type: 'time_saved', description: '25 min per occurrence', estimated_value: '25 min', measured_value: '25 min', measurement_method: 'timer' }],
    });
    assert.equal(imp.before_after.length, 1);
    assert.equal(imp.benefits.length, 1);
    assert.equal(imp.before_after[0].measured, true);
  });
});

// ── 12. Prevention and standardisation ──────────────────────────────────

describe('Prevention and standardisation', () => {
  it('test 33: prevention actions track standardisation status', () => {
    const imp = makeImprovement({
      prevention: [
        { action: 'Add pre-deploy check', standardised: true, work_id: 'w-2' },
        { action: 'Update docs', standardised: false, work_id: null },
      ],
    });
    assert.equal(imp.prevention.length, 2);
    assert.equal(imp.prevention[0].standardised, true);
    assert.equal(imp.prevention[1].standardised, false);
  });
});

// ── 13. Verification ────────────────────────────────────────────────────

describe('Improvement verification', () => {
  it('test 34: verified improvement carries evidence', () => {
    const imp = makeImprovement({
      status: 'verifying',
      verification: {
        method: 'automated test', evidence_ids: ['ev-1', 'ev-2'],
        verified_by: { kind: 'agent', id: 'DS-10' }, verified_at: '2026-10-06T12:00:00Z',
      },
    });
    assert.ok(imp.verification);
    assert.equal(imp.verification.evidence_ids.length, 2);
  });
});
