import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { InMemoryWorkRegistry } from '../work/registry';
import { Scopes } from '../work/scope';
import { VIRAT, PRINCE } from '../work/actors';
import type { Actor } from '../work/types';
import { CEO, routeQuestion, CEO_AUTONOMY } from './types';
import { classifyFounderInput } from './founder-input';
import { processFounderInput } from './orchestrator';
import { canCeoAssign, resolveApprovalAuthority } from './authority';
import { createQuestion } from './coordinator';
import { ROLE_BINDINGS, holdersOf, rolesHeldBy, roleForFunction, functionForText, type RoleBindings } from './roles';
import { buildControlTowerView } from '../control-tower/view';

const now = new Date('2026-10-05T09:00:00Z');
const reg = () => new InMemoryWorkRegistry();
const run = (r: InMemoryWorkRegistry, text: string, opts: Parameters<typeof classifyFounderInput>[2] = {}, from: Actor = VIRAT, bindings?: RoleBindings) =>
  processFounderInput(classifyFounderInput(text, from, { now, ...opts }), r, { now, bindings });

describe('Orchestrator: work creation and reuse', () => {
  it('creates a real, triaged and owned Work item in the correct brand scope', () => {
    const r = reg();
    const out = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    assert.equal(out.kind, 'work_created');
    assert.equal(out.mutationApplied, true);
    const item = r.list()[0];
    assert.equal(r.list().length, 1);
    assert.equal(item.scope.brand, 'moonglasses');
    assert.equal(item.owner?.id, 'MG-01');
    assert.equal(item.state, 'assigned');
  });

  it('reuses existing work instead of creating a duplicate', () => {
    const r = reg();
    r.createItem({ title: 'Fix Moon checkout page', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('moonglasses'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    const out = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    assert.equal(out.kind, 'work_updated');
    assert.equal(out.reusedExistingWork, true);
    assert.equal(r.list().length, 1);
  });

  it('does not attach a new request to an unrelated open item of the same brand', () => {
    const r = reg();
    r.createItem({ title: 'Update product photos', description: '', type: 'task', level: 'work_item', scope: Scopes.brand('moonglasses') }, CEO);
    const out = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    assert.equal(out.kind, 'work_created');
    assert.equal(r.list().length, 2);
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

describe('Orchestrator: audit trail', () => {
  it('records the founder input, authority, routing and result on the Work item', () => {
    const r = reg();
    const out = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    const actions = r.actionsOf(out.workItem!.id);
    assert.equal(actions.length, 1);
    const summary = String((actions[0].data as { summary: string }).summary);
    assert.ok(summary.includes('Founder input'));
    assert.ok(summary.includes('create-work L2 allowed'));
    assert.ok(summary.includes('new work created'));
    assert.equal(r.verifyAudit(out.workItem!.id).ok, true);
  });

  it('records reuse on the existing item', () => {
    const r = reg();
    const first = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    const summaries = r.actionsOf(first.workItem!.id).map((a) => String((a.data as { summary: string }).summary));
    assert.ok(summaries.some((s) => s.includes('existing work reused')));
  });
});

describe('Orchestrator: inputs that must not create work', () => {
  it('greetings and context do not mutate the registry', () => {
    const r = reg();
    for (const t of ['Thanks!', 'FYI the supplier confirmed']) assert.equal(run(r, t).mutationApplied, false, t);
    assert.equal(r.list().length, 0);
  });

  it('a decision with no Work to attach to is not silently recorded', () => {
    const r = reg();
    const out = run(r, 'From now on we will use prepaid only');
    assert.equal(out.mutationApplied, false);
    assert.ok(out.summary.includes('not recorded'));
    assert.equal(r.list().length, 0);
  });

  it('a decision referencing Work is recorded in its audit trail', () => {
    const r = reg();
    const c = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    const out = run(r, 'From now on we will use prepaid only', { work_id: c.workItem!.id });
    assert.equal(out.mutationApplied, true);
    assert.ok(r.actionsOf(c.workItem!.id).some((a) => String((a.data as { summary: string }).summary).includes('founder decision recorded')));
  });

  it('status questions are answered without creating work', () => {
    const r = reg();
    const out = run(r, 'What needs my attention this morning?');
    assert.equal(out.kind, 'question_answered');
    assert.equal(r.list().length, 0);
  });
});

describe('Orchestrator: evidence', () => {
  it('attaches evidence to the referenced work', () => {
    const r = reg();
    const c = r.createItem({ title: 'Bug report', description: '', type: 'incident', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'system_alert', requester: CEO } }, CEO);
    assert.ok(c.ok);
    const id = c.ok ? c.value.id : '';
    const out = run(r, 'Here is the screenshot', { work_id: id });
    assert.equal(out.kind, 'evidence_attached');
    assert.equal(r.get(id)?.evidence.length, 1);
  });
});

describe('Orchestrator: founder principal and authority', () => {
  it('rejects input that is not from the Founder principal, with no mutation', () => {
    const r = reg();
    const out = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' }, { kind: 'agent', id: 'MG-01' });
    assert.equal(out.kind, 'denied');
    assert.equal(r.list().length, 0);
  });

  it('with several pending approvals it asks instead of guessing', () => {
    const r = reg();
    run(r, 'Set up the DNS for Moon', { brand: 'moonglasses' });
    run(r, 'Deploy the Caps webhook', { brand: 'caps' });
    const out = run(r, 'Approved, go ahead');
    assert.equal(out.kind, 'escalated');
    assert.ok(out.summary.includes('Not guessing'));
    assert.ok(r.list().every((i) => i.state === 'pending_approval'));
  });

  it('approval with nothing pending changes nothing', () => {
    const r = reg();
    const out = run(r, 'Approved the budget increase');
    assert.equal(out.kind, 'acknowledged');
    assert.equal(r.list().length, 0);
  });

  it('records a founder approval through the registry and resumes the work', () => {
    const r = reg();
    const c = r.createItem({ title: 'Budget request', description: '', type: 'request', level: 'work_item', scope: Scopes.brand('caps'), source: { channel: 'founder_request', requester: CEO } }, CEO);
    assert.ok(c.ok);
    const id = c.ok ? c.value.id : '';
    r.transition(id, 'triaged', CEO, { payload: { triage: { type: 'request', priority: 'P2', priority_reason: 'budget', scope: Scopes.brand('caps') } } });
    r.transition(id, 'assigned', CEO, { payload: { owner: CEO } });
    const ev = r.addEvidence(id, { kind: 'metric', ref: 'roas', summary: 'ROAS above floor' }, CEO);
    assert.ok(ev.ok);
    r.requestApproval(id, { requested_from: 'virat', authority: 'money', reason: 'Budget', evidence_ids: [ev.ok ? ev.value.id : ''], recommendation: 'Approve' }, CEO);
    const out = run(r, 'Approved, go ahead');
    assert.equal(out.kind, 'approval_recorded');
    assert.equal(r.get(id)?.state, 'assigned');
    assert.equal(r.get(id)?.approval?.decision?.outcome, 'approved');
    assert.equal(r.get(id)?.approval?.decision?.by.id, 'DS-00');
  });
});

describe('Technical deployment: role, holder, approval', () => {
  it('technical deployment text resolves to the technical deployment function and role', () => {
    assert.equal(functionForText('Set up the DNS for Moon'), 'technical_deployment');
    assert.equal(functionForText('Fix the Moon checkout'), null);
    assert.equal(roleForFunction('technical_deployment').id, 'technical_deployment_officer');
  });

  it('the role currently resolves to Prince Keshri as its sole human holder', () => {
    const holders = holdersOf('technical_deployment_officer');
    assert.equal(holders.length, 1);
    assert.equal(holders[0].name, 'Prince Keshri');
    assert.deepEqual(holders[0].actor, PRINCE);
    assert.deepEqual(rolesHeldBy(PRINCE), ['technical_deployment_officer']);
    assert.deepEqual(rolesHeldBy(VIRAT), []);
    assert.ok(Object.keys(ROLE_BINDINGS).length >= 1);
  });

  it('creates Work, gates it on Virat approval and does not assign Prince yet', () => {
    const r = reg();
    const out = run(r, 'Set up the DNS for Moon', { brand: 'moonglasses' });
    assert.equal(out.kind, 'work_created');
    assert.equal(out.routing?.role, 'technical_deployment_officer');
    assert.deepEqual(out.routing?.currentHolders, ['Prince Keshri']);
    assert.equal(out.escalationRequired, true);
    const item = r.get(out.workItem!.id)!;
    assert.equal(item.state, 'pending_approval');
    assert.equal(item.approval?.requested_from, 'virat');
    assert.equal(item.approval?.authority, 'prince_assignment');
    assert.equal(item.owner?.id, 'DS-02');
    assert.ok(![item.owner, ...item.supporting].some((a) => a?.id === 'P-01'));
  });

  it('assigns the role holder only after Virat approves', () => {
    const r = reg();
    const out = run(r, 'Set up the DNS for Moon', { brand: 'moonglasses' });
    const ok = run(r, 'Approved, go ahead');
    assert.equal(ok.kind, 'approval_recorded');
    const item = r.get(out.workItem!.id)!;
    assert.equal(item.owner?.id, 'P-01');
    assert.equal(item.approval?.decision?.by.id, 'DS-00');
  });

  it('the CEO cannot assign the role holder on its own', () => {
    const v = canCeoAssign(PRINCE);
    assert.equal(v.allowed, false);
    assert.ok(!v.allowed && v.holder === 'DS-00' && v.reason.includes('technical_deployment_officer'));
    assert.equal(canCeoAssign({ kind: 'agent', id: 'DS-11' }).allowed, true);
  });

  it('technical deployment questions route to the current role holder', () => {
    assert.equal(routeQuestion('technical_deployment'), 'P-01');
    assert.equal(createQuestion('w-1', VIRAT, 'Which DNS records?', 'technical_deployment', now).routed_to?.id, 'P-01');
    const r = reg();
    const out = run(r, 'What DNS records does Moon need?', { brand: 'moonglasses' });
    assert.equal(out.kind, 'question_raised');
    assert.equal(out.question?.routed_to?.id, 'P-01');
  });

  it('reuses existing deployment work rather than opening another', () => {
    const r = reg();
    run(r, 'Set up the DNS for Moon', { brand: 'moonglasses' });
    const again = run(r, 'Set up the DNS for Moon', { brand: 'moonglasses' });
    assert.equal(again.kind, 'work_updated');
    assert.equal(r.list().length, 1);
  });
});

describe('Role model, not person exceptions', () => {
  const NEW_HOLDER: Actor = { kind: 'human', id: 'P-02' };
  const swapped: RoleBindings = {
    technical_deployment_officer: { ...ROLE_BINDINGS.technical_deployment_officer, holders: [{ actor: NEW_HOLDER, name: 'Asha Rao' }] },
  };

  it('changing the configured holder changes routing without touching authority code', () => {
    assert.equal(canCeoAssign(NEW_HOLDER, swapped).allowed, false);
    assert.equal(canCeoAssign(PRINCE, swapped).allowed, true);
    assert.equal(routeQuestion('technical_deployment', swapped), 'P-02');

    const r = reg();
    const out = run(r, 'Set up the DNS for Moon', { brand: 'moonglasses' }, VIRAT, swapped);
    assert.deepEqual(out.routing?.currentHolders, ['Asha Rao']);
    run(r, 'Approved, go ahead', {}, VIRAT, swapped);
    assert.equal(r.get(out.workItem!.id)?.owner?.id, 'P-02');
  });

  it('generic CEO code names no person and has no isPrince exception', () => {
    for (const f of ['authority', 'orchestrator', 'coordinator', 'response', 'context-pack', 'founder-service']) {
      const src = readFileSync(join(process.cwd(), 'src/lib/ceo', `${f}.ts`), 'utf8');
      assert.ok(!/\bisPrince\b|\bPRINCE_ID\b|\bPRINCE\b|Prince Keshri/.test(src), `${f}.ts names a person`);
    }
  });

  it('autonomy grants name roles and capabilities, not people', () => {
    const assign = CEO_AUTONOMY.find((g) => g.capability === 'assign-work')!;
    assert.deepEqual(assign.limits?.restrictedRoles, ['technical_deployment_officer']);
    assert.ok(CEO_AUTONOMY.every((g) => !/prince|virat|khiwani/i.test(g.capability)));
  });

  it('Virat approval requirements remain, and unknown capabilities default to L4', () => {
    assert.equal(resolveApprovalAuthority('prince_assignment').capability, 'approve-restricted-assignment');
    assert.deepEqual(resolveApprovalAuthority('prince_assignment').holders, ['virat']);
    const out = run(reg(), 'Approved');
    assert.equal(out.authority.level, 'L4');
  });
});
