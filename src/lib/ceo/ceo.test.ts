import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorkRegistry } from '../work/registry';
import { Scopes } from '../work/scope';
import { VIRAT, PRINCE } from '../work/actors';
import { buildControlTowerView } from '../control-tower/view';
import {
  CEO, CEO_ID, AGENT_REGISTRY, findAgent, brandCeoFor, directReports,
  canActAutonomously, autonomyFor, routeQuestion,
  TECH_COST_GUARDRAILS, AUTONOMY_LABELS,
  type MorningBoard, type WorkQuestion,
} from './types';
import {
  classifyRequest, suggestOwner, findExistingWork,
  runAuditLoop, createQuestion, answerQuestion,
} from './coordinator';
import { buildMorningBoard } from './morning-board';

const now = new Date('2026-10-05T09:00:00Z');

function freshRegistry(clockIso?: string): InMemoryWorkRegistry {
  return new InMemoryWorkRegistry(clockIso ? { now: () => clockIso } : undefined);
}

// ── Agent registry ────────────────────────────────────────────────────────

describe('Agent registry', () => {
  it('CEO is DS-02 Dev', () => {
    const ceo = findAgent('DS-02');
    assert.ok(ceo);
    assert.equal(ceo.name, 'Dev');
    assert.equal(ceo.role, 'ceo');
  });

  it('brand CEOs report to Dev', () => {
    const reports = directReports('DS-02');
    const brandCeos = reports.filter((r) => r.role === 'brand_ceo');
    assert.ok(brandCeos.length >= 2);
    assert.ok(brandCeos.some((r) => r.name === 'Moon'));
    assert.ok(brandCeos.some((r) => r.name === 'Trav'));
  });

  it('finds brand CEO for moonglasses', () => {
    const moon = brandCeoFor('moonglasses');
    assert.ok(moon);
    assert.equal(moon.id, 'MG-01');
  });

  it('Myoho is the guardian', () => {
    const myoho = findAgent('DS-01');
    assert.ok(myoho);
    assert.equal(myoho.role, 'guardian');
  });
});

// ── Autonomy model ────────────────────────────────────────────────────────

describe('Autonomy model', () => {
  it('CEO can create work at L2', () => {
    assert.ok(canActAutonomously('create-work'));
    assert.equal(autonomyFor('create-work')?.level, 'L2');
  });

  it('CEO can monitor at L3', () => {
    assert.ok(canActAutonomously('monitor-work'));
  });

  it('spending is L4 (human decision)', () => {
    assert.ok(!canActAutonomously('approve-spend'));
    assert.equal(autonomyFor('approve-spend')?.level, 'L4');
    assert.equal(autonomyFor('approve-spend')?.holder, 'DS-00');
  });

  it('restricted assignment approval is L4', () => {
    assert.equal(autonomyFor('approve-restricted-assignment')?.level, 'L4');
  });

  it('all 5 levels have labels', () => {
    assert.equal(Object.keys(AUTONOMY_LABELS).length, 5);
  });
});

// ── Scenario A: Virat gives a simple task ─────────────────────────────────

describe('Scenario A: Simple task from Virat', () => {
  it('classifies as create_work and creates/finds work', () => {
    const action = classifyRequest({
      text: 'Handle the Travaholic website issue',
      from: VIRAT,
      brand: 'caps',
    });
    assert.equal(action.action, 'create_work');
    assert.equal(action.scope?.brand, 'caps');
  });

  it('suggests brand CEO as owner for brand work', () => {
    const owner = suggestOwner(Scopes.brand('caps'), 'request');
    assert.equal(owner.id, 'TC-01');
  });

  it('suggests CEO as owner for devshop work', () => {
    const owner = suggestOwner(Scopes.devshop(), 'task');
    assert.equal(owner.id, CEO_ID);
  });
});

// ── Scenario B: Technical issue ───────────────────────────────────────────

describe('Scenario B: Technical issue', () => {
  it('investigation request routes through CEO', () => {
    const action = classifyRequest({
      text: 'Check why the checkout is broken on Travaholic',
      from: VIRAT,
      brand: 'caps',
    });
    assert.equal(action.action, 'investigation');
  });
});

// ── Scenario C: Prince asks a question ────────────────────────────────────

describe('Scenario C: Question on work', () => {
  it('creates a question associated with existing work', () => {
    const q = createQuestion('work-123', PRINCE, 'What DNS records do I need?', 'technical', now);
    assert.equal(q.work_id, 'work-123');
    assert.equal(q.routing, 'technical');
    assert.equal(q.status, 'open');
    assert.equal(q.routed_to?.id, CEO_ID);
  });

  it('strategic questions route to Virat', () => {
    assert.equal(routeQuestion('strategic'), 'DS-00');
  });

  it('technical deployment questions route to the role holder', () => {
    assert.equal(routeQuestion('technical_deployment'), 'P-01');
  });

  it('questions can be answered', () => {
    const q = createQuestion('work-123', PRINCE, 'What DNS records?', 'technical', now);
    const answered = answerQuestion(q, 'A record pointing to...', CEO, now);
    assert.equal(answered.status, 'answered');
    assert.equal(answered.answered_by?.id, CEO_ID);
  });
});

// ── Scenario D: Work is blocked ───────────────────────────────────────────

describe('Scenario D: Blocked work detection', () => {
  it('audit detects blocked work older than 24h', () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000).toISOString();
    const reg = freshRegistry(twoDaysAgo);
    const r = reg.createItem({
      title: 'Fix checkout',
      description: 'Broken checkout',
      type: 'incident',
      level: 'work_item',
      scope: Scopes.brand('caps'),
      source: { channel: 'system_alert', requester: CEO },
    }, CEO);
    assert.ok(r.ok);
    const item = r.ok ? r.value : null;
    assert.ok(item);

    reg.transition(item!.id, 'triaged', CEO, { payload: { triage: { type: 'incident', priority: 'P1', priority_reason: 'broken', scope: item!.scope } } });
    reg.transition(item!.id, 'assigned', CEO, { payload: { owner: { kind: 'agent', id: 'TC-01' } } });
    reg.transition(item!.id, 'in_progress', { kind: 'agent', id: 'TC-01' });
    reg.transition(item!.id, 'blocked', { kind: 'agent', id: 'TC-01' }, { payload: { blocked: { reason: 'Waiting on DNS' } } });

    const findings = runAuditLoop(reg, now);
    const blockedFinding = findings.find((f) => f.category === 'blocked_work');
    assert.ok(blockedFinding);
    assert.equal(blockedFinding.items.length, 1);
  });
});

// ── Scenario E: Approval required ─────────────────────────────────────────

describe('Scenario E: Approval required', () => {
  it('pending approval shows on morning board', () => {
    const reg = freshRegistry();
    const r = reg.createItem({
      title: 'New ad budget',
      description: 'Increase ad spend',
      type: 'request',
      level: 'work_item',
      scope: Scopes.brand('caps'),
      source: { channel: 'founder_request', requester: { kind: 'agent', id: 'TC-01' } },
    }, CEO);
    assert.ok(r.ok);
    const item = r.ok ? r.value : null!;
    reg.transition(item.id, 'triaged', CEO, { payload: { triage: { type: 'request', priority: 'P2', priority_reason: 'budget', scope: item.scope } } });
    reg.transition(item.id, 'assigned', CEO, { payload: { owner: CEO } });
    reg.transition(item.id, 'in_progress', CEO);
    const ev = reg.addEvidence(item.id, { kind: 'metric', ref: 'roas-report', summary: 'ROAS above floor for 7 days' }, CEO);
    assert.ok(ev.ok);
    const evidenceId = ev.ok ? ev.value.id : '';
    reg.requestApproval(item.id, {
      requested_from: 'virat',
      authority: 'money',
      reason: 'Increase Travaholic ad budget to ₹1000/day',
      evidence_ids: [evidenceId],
      recommendation: 'Approve — ROAS above floor',
    }, CEO);

    const board = buildMorningBoard(reg, now);
    assert.ok(board.pending_approval_count >= 1);
    const decision = board.items.find((i) => i.category === 'decision_required');
    assert.ok(decision);
    assert.ok(decision.summary.includes('money'));
  });
});

// ── Scenario F: Duplicate request ─────────────────────────────────────────

describe('Scenario F: Duplicate detection', () => {
  it('finds existing work rather than creating another', () => {
    const reg = freshRegistry();
    reg.createItem({
      title: 'Fix Travaholic checkout page',
      description: 'Checkout broken',
      type: 'incident',
      level: 'work_item',
      scope: Scopes.brand('caps'),
      source: { channel: 'system_alert', requester: CEO },
    }, CEO);

    const existing = findExistingWork(reg, 'Fix Travaholic checkout broken', Scopes.brand('caps'));
    assert.ok(existing);
    assert.ok(existing.title.includes('checkout'));
  });

  it('does not find duplicate for different brand', () => {
    const reg = freshRegistry();
    reg.createItem({
      title: 'Fix Travaholic checkout page',
      description: 'Checkout broken',
      type: 'incident',
      level: 'work_item',
      scope: Scopes.brand('caps'),
      source: { channel: 'system_alert', requester: CEO },
    }, CEO);

    const existing = findExistingWork(reg, 'Fix checkout page', Scopes.brand('moonglasses'));
    assert.equal(existing, null);
  });
});

// ── Scenario G: Cross-brand issue ─────────────────────────────────────────

describe('Scenario G: Cross-brand patterns', () => {
  it('audit detects recurring incidents for one brand', () => {
    const reg = freshRegistry();
    reg.createItem({ title: 'Health check fail 1', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    reg.createItem({ title: 'Health check fail 2', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'system_alert', requester: CEO } }, CEO);

    const findings = runAuditLoop(reg, now);
    const recurring = findings.find((f) => f.category === 'recurring_incidents');
    assert.ok(recurring);
    assert.equal(recurring.items.length, 2);
    assert.ok(recurring.recommendation.includes('caps'));
  });
});

// ── Scenario H: Recurring problem ─────────────────────────────────────────

describe('Scenario H: Recurring problem identification', () => {
  it('multiple open incidents are flagged', () => {
    const reg = freshRegistry();
    for (let i = 0; i < 3; i++) {
      reg.createItem({ title: `Checkout fail #${i}`, description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('moonglasses'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    }
    const findings = runAuditLoop(reg, now);
    const recurring = findings.find((f) => f.category === 'recurring_incidents');
    assert.ok(recurring);
    assert.equal(recurring.items.length, 3);
  });
});

// ── Scenario I: Cost anomaly ──────────────────────────────────────────────

describe('Scenario I: Technology cost guardrails', () => {
  it('guardrails are defined', () => {
    assert.ok(TECH_COST_GUARDRAILS.length >= 6);
    assert.ok(TECH_COST_GUARDRAILS.some((g) => g.rule === 'deterministic-first'));
    assert.ok(TECH_COST_GUARDRAILS.some((g) => g.rule === 'bounded-retries'));
    assert.ok(TECH_COST_GUARDRAILS.some((g) => g.rule === 'attributable-usage'));
  });
});

// ── Scenario J: "What needs my attention?" ────────────────────────────────

describe('Scenario J: Morning board — material exceptions only', () => {
  it('empty registry produces empty morning board', () => {
    const reg = freshRegistry();
    const board = buildMorningBoard(reg, now);
    assert.equal(board.items.length, 0);
    assert.equal(board.total_open_work, 0);
  });

  it('status query classifies correctly', () => {
    const action = classifyRequest({
      text: 'What needs my attention this morning?',
      from: VIRAT,
    });
    assert.equal(action.action, 'status_query');
  });

  it('morning board only surfaces material exceptions', () => {
    const reg = freshRegistry();
    // Normal P3 task — should NOT appear on morning board
    reg.createItem({ title: 'Update product photos', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('caps') }, CEO);

    // P0 incident — SHOULD appear
    const r = reg.createItem({ title: 'Payment gateway down', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    if (r.ok) {
      reg.transition(r.value.id, 'triaged', CEO, { payload: { triage: { type: 'incident', priority: 'P0', priority_reason: 'gateway', scope: r.value.scope } } });
    }

    const board = buildMorningBoard(reg, now);
    assert.equal(board.total_open_work, 2);
    assert.ok(board.critical_count >= 1);
    const criticals = board.items.filter((i) => i.category === 'critical_incident');
    assert.ok(criticals.every((i) => i.priority === 'P0' || i.priority === 'P1'));
  });
});

// ── Control Tower integration ─────────────────────────────────────────────

describe('Control Tower reads Work Registry', () => {
  it('builds view from registry', () => {
    const reg = freshRegistry();
    reg.createItem({ title: 'Test item', description: '', type: 'task', level: 'work_item', scope: Scopes.devshop() }, CEO);
    const view = buildControlTowerView(reg);
    assert.equal(view.total, 1);
    assert.ok(view.byStage.detect.length === 1);
  });

  it('filters by brand', () => {
    const reg = freshRegistry();
    reg.createItem({ title: 'Brand work', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('caps') }, CEO);
    reg.createItem({ title: 'Other work', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses') }, CEO);

    const capView = buildControlTowerView(reg, { brandFilter: 'caps' });
    assert.equal(capView.total, 1);
    assert.equal(capView.byStage.detect[0].title, 'Brand work');
  });
});

// ── Request classification ────────────────────────────────────────────────

describe('Request classification', () => {
  it('approval response', () => {
    const action = classifyRequest({ text: 'Approved, go ahead', from: VIRAT });
    assert.equal(action.action, 'approval_response');
  });

  it('generic instruction delegates', () => {
    const action = classifyRequest({ text: 'Schedule a call with the Moon founder', from: VIRAT });
    assert.equal(action.action, 'delegate');
  });
});
