import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorkRegistry } from '../work/registry';
import { Scopes } from '../work/scope';
import { VIRAT } from '../work/actors';
import { CEO } from './types';
import { classifyFounderInput } from './founder-input';
import { processFounderInput } from './orchestrator';
import { buildControlTowerView } from '../control-tower/view';

const now = new Date('2026-10-05T09:00:00Z');
const reg = () => new InMemoryWorkRegistry();
const run = (r: InMemoryWorkRegistry, text: string, opts: Parameters<typeof classifyFounderInput>[2] = {}) =>
  processFounderInput(classifyFounderInput(text, VIRAT, { now, ...opts }), r, { now });

describe('Orchestrator: work creation and reuse', () => {
  it('creates a real Work item for a genuine work request', () => {
    const r = reg();
    const out = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    assert.equal(out.kind, 'work_created');
    assert.equal(out.mutationApplied, true);
    assert.equal(r.list().length, 1);
    assert.equal(r.list()[0].scope.brand, 'moonglasses');
  });

  it('reuses existing work instead of creating a duplicate', () => {
    const r = reg();
    r.createItem({ title: 'Fix Moon checkout page', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('moonglasses'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    const out = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    assert.equal(out.kind, 'work_found');
    assert.equal(out.mutationApplied, false);
    assert.equal(r.list().length, 1);
  });

  it('running the same request twice creates only one item', () => {
    const r = reg();
    run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    assert.equal(r.list().length, 1);
  });

  it('created work is visible to the Control Tower', () => {
    const r = reg();
    run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    assert.equal(buildControlTowerView(r).total, 1);
  });
});

describe('Orchestrator: inputs that must not create work', () => {
  it('greetings, context and decisions do not mutate the registry', () => {
    const r = reg();
    for (const t of ['Thanks!', 'FYI the supplier confirmed', 'From now on we will use prepaid only']) {
      const out = run(r, t);
      assert.equal(out.mutationApplied, false, t);
    }
    assert.equal(r.list().length, 0);
  });

  it('questions are answered without creating work', () => {
    const r = reg();
    const out = run(r, 'What needs my attention this morning?');
    assert.equal(out.kind, 'question_answered');
    assert.equal(r.list().length, 0);
  });
});

describe('Orchestrator: evidence and audit', () => {
  it('attaches evidence to existing work and records it in the audit trail', () => {
    const r = reg();
    const c = r.createItem({ title: 'Bug report', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    assert.ok(c.ok);
    const id = c.ok ? c.value.id : '';
    const before = r.get(id)?.evidence.length ?? 0;
    const out = run(r, 'Here is the screenshot', { work_id: id });
    assert.equal(out.kind, 'evidence_attached');
    assert.equal(out.mutationApplied, true);
    assert.equal(r.get(id)?.evidence.length, before + 1);
  });
});

describe('Orchestrator: authority', () => {
  it('spend approval is escalated, never auto-approved', () => {
    const r = reg();
    const out = run(r, 'Approved the budget increase');
    assert.equal(out.authority.allowed, false);
    assert.equal(r.list().length, 0);
  });

  it('unknown capability defaults to L4', () => {
    const r = reg();
    const out = run(r, 'Approved');
    assert.notEqual(out.kind, 'work_created');
    assert.equal(r.list().length, 0);
  });
});
