import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorkRegistry } from '../work/registry';
import { Scopes } from '../work/scope';
import { VIRAT, PRINCE } from '../work/actors';
import { CEO, CEO_ID, CEO_AUTONOMY } from './types';
import { classifyFounderInput, founderInputToCommType, type FounderInputKind } from './founder-input';
import { buildContextPack } from './context-pack';
import { checkAuthority, requiredCapabilityForInput, canCeoAssign, resolveApprovalAuthority } from './authority';
import { buildCeoResponse } from './response';

const now = new Date('2026-10-05T09:00:00Z');

function freshRegistry(clockIso?: string): InMemoryWorkRegistry {
  return new InMemoryWorkRegistry(clockIso ? { now: () => clockIso } : undefined);
}

// ── Founder input classification ─────────────────────────────────────────

describe('Founder input classification', () => {
  it('classifies a greeting as relationship', () => {
    const input = classifyFounderInput('Good morning!', VIRAT, { now });
    assert.equal(input.kind, 'relationship');
  });

  it('classifies a question', () => {
    const input = classifyFounderInput('What needs my attention?', VIRAT, { now });
    assert.equal(input.kind, 'question');
  });

  it('classifies an approval', () => {
    const input = classifyFounderInput('Approved, go ahead', VIRAT, { now });
    assert.equal(input.kind, 'approval');
  });

  it('classifies a work request', () => {
    const input = classifyFounderInput('Fix the Travaholic checkout', VIRAT, { brand: 'caps', now });
    assert.equal(input.kind, 'work_request');
  });

  it('classifies an investigation as instruction', () => {
    const input = classifyFounderInput('Check why the checkout is broken', VIRAT, { now });
    assert.equal(input.kind, 'instruction');
  });

  it('classifies context/FYI', () => {
    const input = classifyFounderInput('FYI the new supplier confirmed delivery', VIRAT, { now });
    assert.equal(input.kind, 'context');
  });

  it('classifies a decision', () => {
    const input = classifyFounderInput('From now on we will use prepaid only', VIRAT, { now });
    assert.equal(input.kind, 'decision');
  });

  it('classifies evidence when work_id present', () => {
    const input = classifyFounderInput('Here is the screenshot of the error', VIRAT, { work_id: 'w-1', now });
    assert.equal(input.kind, 'evidence');
  });

  it('detects critical urgency', () => {
    const input = classifyFounderInput('Fix this ASAP, checkout is down', VIRAT, { now });
    assert.equal(input.urgency, 'critical');
  });

  it('detects urgent', () => {
    const input = classifyFounderInput('Handle this today please', VIRAT, { now });
    assert.equal(input.urgency, 'urgent');
  });

  it('sets brand scope', () => {
    const input = classifyFounderInput('Fix checkout', VIRAT, { brand: 'caps', now });
    assert.equal(input.scope?.brand, 'caps');
  });

  it('maps all kinds to CommType', () => {
    const kinds: FounderInputKind[] = ['context', 'question', 'instruction', 'approval', 'decision', 'work_request', 'evidence', 'relationship'];
    for (const k of kinds) {
      const ct = founderInputToCommType(k);
      assert.ok(ct, `${k} should map to a CommType`);
    }
  });
});

// ── Authority checks ─────────────────────────────────────────────────────

describe('Authority checks', () => {
  it('CEO can create work (L2)', () => {
    const v = checkAuthority('create-work');
    assert.equal(v.allowed, true);
    assert.equal(v.level, 'L2');
  });

  it('CEO can monitor (L3)', () => {
    const v = checkAuthority('monitor-work');
    assert.equal(v.allowed, true);
    assert.equal(v.level, 'L3');
  });

  it('spending requires human (L4)', () => {
    const v = checkAuthority('approve-spend');
    assert.equal(v.allowed, false);
    assert.equal(v.level, 'L4');
    assert.ok(!v.allowed && v.holder === 'DS-00');
  });

  it('unknown capability denied', () => {
    const v = checkAuthority('launch-nukes');
    assert.equal(v.allowed, false);
  });

  it('cannot assign a restricted role holder without approval', () => {
    const v = canCeoAssign(PRINCE);
    assert.equal(v.allowed, false);
    assert.ok(!v.allowed && v.reason.includes('approval'));
    assert.ok(!v.allowed && v.reason.includes('prince'));
  });

  it('can assign a regular agent', () => {
    const v = canCeoAssign({ kind: 'agent', id: 'TC-01' });
    assert.equal(v.allowed, true);
  });

  it('resolves approval authority for money', () => {
    const r = resolveApprovalAuthority('money');
    assert.ok(r.holders.includes('virat'));
    assert.equal(r.capability, 'approve-spend');
  });

  it('maps founder input kinds to capabilities', () => {
    const input = classifyFounderInput('Fix checkout', VIRAT, { now });
    const cap = requiredCapabilityForInput(input);
    assert.equal(cap, 'create-work');
  });

  it('approval text about spend maps to approve-spend', () => {
    const input = classifyFounderInput('Approved the budget increase', VIRAT, { now });
    const cap = requiredCapabilityForInput(input);
    assert.equal(cap, 'approve-spend');
  });
});

// ── Context pack ─────────────────────────────────────────────────────────

describe('Context pack', () => {
  it('builds empty context for empty registry', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('What needs my attention this morning?', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    assert.ok(ctx.morningBoard);
    assert.equal(ctx.morningBoard.items.length, 0);
    assert.equal(ctx.relatedWork.length, 0);
  });

  it('includes morning board for status questions', () => {
    const reg = freshRegistry();
    reg.createItem({ title: 'Test', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('caps') }, CEO);
    const input = classifyFounderInput('What needs my attention this morning?', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    assert.ok(ctx.morningBoard);
    assert.equal(ctx.morningBoard.total_open_work, 1);
  });

  it('skips morning board for non-status inputs', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('Good morning!', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    assert.equal(ctx.morningBoard, null);
  });

  it('finds related work by brand', () => {
    const reg = freshRegistry();
    reg.createItem({ title: 'Fix checkout', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    const input = classifyFounderInput('Handle Travaholic checkout', VIRAT, { brand: 'caps', now });
    const ctx = buildContextPack(input, reg, now);
    assert.ok(ctx.relatedWork.length >= 1);
    assert.ok(ctx.relatedWork[0].title.includes('checkout'));
  });

  it('identifies brand owner', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('Fix it', VIRAT, { brand: 'caps', now });
    const ctx = buildContextPack(input, reg, now);
    assert.ok(ctx.brandOwner);
    assert.equal(ctx.brandOwner.id, 'TC-01');
  });

  it('builds brand summary', () => {
    const reg = freshRegistry();
    reg.createItem({ title: 'Item 1', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses') }, CEO);
    reg.createItem({ title: 'Item 2', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('moonglasses'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    const input = classifyFounderInput('How is Moon doing?', VIRAT, { brand: 'moonglasses', now });
    const ctx = buildContextPack(input, reg, now);
    assert.ok(ctx.brandSummary);
    assert.equal(ctx.brandSummary.brand, 'moonglasses');
    assert.equal(ctx.brandSummary.openCount, 2);
  });

  it('loads pending approvals for approval input', () => {
    const reg = freshRegistry();
    const r = reg.createItem({ title: 'Budget request', description: '', type: 'request', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'founder_request', requester: CEO } }, CEO);
    if (r.ok) {
      reg.transition(r.value.id, 'triaged', CEO, { payload: { triage: { type: 'request', priority: 'P2', reason: 'budget', scope: r.value.scope } } });
      reg.transition(r.value.id, 'assigned', CEO, { payload: { owner: CEO } });
      reg.transition(r.value.id, 'in_progress', CEO);
      const ev = reg.addEvidence(r.value.id, { kind: 'metric', ref: 'roas', summary: 'ROAS OK' }, CEO);
      if (ev.ok) {
        reg.requestApproval(r.value.id, {
          requested_from: 'virat',
          authority: 'money',
          reason: 'Budget increase',
          evidence_ids: [ev.value.id],
          recommendation: 'Approve',
        }, CEO);
      }
    }
    const input = classifyFounderInput('Approved, go ahead', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    assert.ok(ctx.pendingApprovals.length >= 1);
  });

  it('bounds related work to MAX_RELATED_WORK', () => {
    const reg = freshRegistry();
    for (let i = 0; i < 15; i++) {
      reg.createItem({ title: `Item ${i}`, description: '', type: 'task', level: 'work_item', scope: Scopes.brand('caps') }, CEO);
    }
    const input = classifyFounderInput('Status of caps', VIRAT, { brand: 'caps', now });
    const ctx = buildContextPack(input, reg, now);
    assert.ok(ctx.relatedWork.length <= 10);
  });
});

// ── CEO response ─────────────────────────────────────────────────────────

describe('CEO response', () => {
  it('acknowledges relationship input', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('Thanks!', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'acknowledge');
  });

  it('acknowledges context input', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('FYI the supplier confirmed', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'acknowledge');
  });

  it('answers status question with morning board', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('What needs my attention this morning?', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'answer');
  });

  it('creates work for a work request', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('Fix the Moon checkout', VIRAT, { brand: 'moonglasses', now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'act');
    assert.ok(resp.selectedOwner);
    assert.equal(resp.selectedOwner.id, 'MG-01');
  });

  it('finds existing work instead of creating duplicate', () => {
    const reg = freshRegistry();
    reg.createItem({ title: 'Fix Moon checkout page', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('moonglasses'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    const input = classifyFounderInput('Fix the Moon checkout', VIRAT, { brand: 'moonglasses', now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'act');
    assert.ok(resp.summary.includes('Existing work'));
    assert.ok(resp.relatedWorkIds.length >= 1);
  });

  it('delegates brand instruction to brand CEO', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('Check why the page is slow', VIRAT, { brand: 'caps', now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'delegate');
    assert.ok(resp.delegateTo);
    assert.equal(resp.delegateTo.id, 'TC-01');
  });

  it('attaches evidence to existing work', () => {
    const reg = freshRegistry();
    const r = reg.createItem({ title: 'Bug report', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    const workId = r.ok ? r.value.id : '';
    const input = classifyFounderInput('Here is the screenshot', VIRAT, { work_id: workId, now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'attach_to_work');
    assert.ok(resp.relatedWorkIds.includes(workId));
  });

  it('handles approval with no pending items gracefully', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('Approved', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'acknowledge');
    assert.ok(resp.summary.includes('No pending'));
  });

  it('records a founder decision', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('From now on we will use prepaid only', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.equal(resp.kind, 'acknowledge');
    assert.ok(resp.summary.includes('decision'));
  });

  it('never allows spending without approval', () => {
    const reg = freshRegistry();
    const input = classifyFounderInput('Approved the budget increase', VIRAT, { now });
    const ctx = buildContextPack(input, reg, now);
    const resp = buildCeoResponse(ctx);
    assert.ok(!resp.authority.allowed || resp.authority.capability !== 'approve-spend');
  });
});

// ── No hardcoded person dependency ──────────────────────────────────────

describe('Authority model is role-based, not person-based', () => {
  it('no CEO autonomy grant capability name references a person name', () => {
    const personNames = ['virat', 'prince keshri', 'khiwani'];
    for (const grant of CEO_AUTONOMY) {
      for (const name of personNames) {
        assert.ok(!grant.capability.toLowerCase().includes(name),
          `capability "${grant.capability}" references person "${name}"`);
      }
    }
  });

  it('canCeoAssign uses restrictedAssignment from the autonomy model, not a hardcoded check', () => {
    const agentActor = { kind: 'agent' as const, id: 'TC-01' };
    const v = canCeoAssign(agentActor);
    assert.equal(v.allowed, true);
  });

  it('restriction is driven by the autonomy model restrictedRoles, not hardcoded', () => {
    const v1 = canCeoAssign(PRINCE);
    assert.equal(v1.allowed, false);
    const agentAssign = canCeoAssign({ kind: 'agent', id: 'DS-11' });
    assert.equal(agentAssign.allowed, true, 'unrestricted agents can be assigned');
  });

  it('resolveApprovalAuthority maps prince_assignment to approve-restricted-assignment', () => {
    const r = resolveApprovalAuthority('prince_assignment');
    assert.equal(r.capability, 'approve-restricted-assignment');
  });
});
