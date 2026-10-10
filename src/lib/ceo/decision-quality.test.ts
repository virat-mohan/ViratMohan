// Priority, Work matching and technical deployment routing: the CEO's internal decisions.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorkRegistry } from '../work/registry';
import { Scopes } from '../work/scope';
import { VIRAT } from '../work/actors';
import { CEO, CEO_AUTONOMY, autonomyFor } from './types';
import { classifyFounderInput } from './founder-input';
import { processFounderInput } from './orchestrator';
import { decidePriority } from './priority-policy';
import { matchExistingWork, subjectWords } from './work-matcher';
import { deploymentIntent, isDeploymentQuestion } from './deployment-intent';
import { buildMorningBoard } from './morning-board';
import { checkAuthority } from './authority';

const now = new Date('2026-10-05T09:00:00Z');
const run = (r: InMemoryWorkRegistry, text: string, opts: Parameters<typeof classifyFounderInput>[2] = {}) =>
  processFounderInput(classifyFounderInput(text, VIRAT, { now, ...opts }), r, { now });
const seed = (r: InMemoryWorkRegistry, title: string, brand: string | null = 'moonglasses') => {
  const c = r.createItem({ title, type: 'task', level: 'work_item', scope: brand ? Scopes.brand(brand) : Scopes.devshop() }, CEO);
  assert.ok(c.ok);
  return c.ok ? c.value : (null as never);
};

describe('Priority policy', () => {
  it('critical outage: checkout down lands at P0, not P2, and shows as Critical on the Morning Board', () => {
    const r = new InMemoryWorkRegistry();
    const out = run(r, 'The Moon checkout is down ASAP', { brand: 'moonglasses' });
    assert.equal(out.workItem?.priority, 'P0');
    assert.equal(out.priority?.basis, 'rule_floor');
    assert.equal(out.workItem?.priority_factors?.revenueProfitRisk, 'critical');
    assert.equal(buildMorningBoard(r, now).critical_count, 1);
  });

  it('payment failure is P0', () => {
    assert.equal(decidePriority('Payments are failing on the Caps store', 'normal').priority, 'P0');
    assert.equal(decidePriority('Investigate the payment failure', 'normal').priority, 'P0');
  });

  it('production outage is P0', () => {
    const d = decidePriority('Production outage on the API', 'normal');
    assert.equal(d.priority, 'P0');
    assert.equal(d.factors.operationalDisruption, 'critical');
  });

  it('a severe customer-impacting incident is P1', () => {
    const d = decidePriority('Customers are being charged twice', 'normal');
    assert.equal(d.priority, 'P1');
    assert.equal(d.factors.customerHarm, 'high');
  });

  it('a security compromise is P0 and an exposure is P1', () => {
    assert.equal(decidePriority('Our API key was leaked', 'normal').priority, 'P0');
    assert.equal(decidePriority('The admin page is exposed', 'normal').priority, 'P1');
  });

  it('an ordinary improvement is P4 and ordinary work is P3', () => {
    const imp = decidePriority('Improve the homepage banner', 'normal');
    assert.equal(imp.priority, 'P4');
    assert.equal(imp.type, 'improvement');
    assert.equal(decidePriority('Update the homepage banner', 'normal').priority, 'P3');
  });

  it('end to end: an improvement request becomes Work of type improvement at P4', () => {
    const r = new InMemoryWorkRegistry();
    const out = run(r, 'Improve the homepage banner', { brand: 'caps' });
    assert.equal(out.kind, 'work_created');
    assert.deepEqual([out.workItem?.type, out.workItem?.priority], ['improvement', 'P4']);
  });

  it('asking about a failure rate or a report is not an incident', () => {
    assert.equal(decidePriority('Review the payment failure rate', 'normal').priority, 'P3');
    assert.equal(decidePriority('Report on checkout metrics', 'normal').priority, 'P3');
  });

  it('ambiguous urgency is held at the rule priority and shown as an advisory that needs Virat', () => {
    const r = new InMemoryWorkRegistry();
    const out = run(r, 'Fix the homepage banner ASAP', { brand: 'caps' });
    assert.equal(out.workItem?.priority, 'P3');
    assert.deepEqual(out.priority?.advisory && { rec: out.priority.advisory.recommended, req: out.priority.advisory.requires }, { rec: 'P1', req: 'DS-00' });
    assert.ok(out.summary.includes('make it P1'));
  });

  it('an explicit Founder priority is applied and recorded as his instruction, in either direction', () => {
    const up = decidePriority('Fix the homepage banner, make it P1', 'normal');
    assert.deepEqual([up.priority, up.basis], ['P1', 'founder_instruction']);
    const r = new InMemoryWorkRegistry();
    const down = run(r, 'The Moon checkout is down, make it P3', { brand: 'moonglasses' });
    assert.equal(down.workItem?.priority, 'P3');
    assert.ok(down.workItem?.priority_reason?.includes('rules would give P0'));
  });

  it('the decision is recorded: factors, reason and a triage event', () => {
    const r = new InMemoryWorkRegistry();
    const out = run(r, 'The Moon checkout is down', { brand: 'moonglasses' });
    const item = r.get(out.workItem!.id)!;
    assert.ok(item.priority_reason?.startsWith('Rule floor P0'));
    assert.ok(item.events.some((e) => e.kind === 'state_change' && (e.data as { priority?: string }).priority === 'P0'));
    assert.ok(r.actionsOf(item.id).some((a) => String((a.data as { summary: string }).summary).includes('rule_floor')));
  });

  it('creating work no longer limits severity; judgement above the rules stays an L1 recommendation', () => {
    assert.equal(autonomyFor('create-work')?.limits?.maxPriority, undefined);
    assert.equal(autonomyFor('apply-priority-rules')?.level, 'L3');
    assert.equal(autonomyFor('prioritise-work')?.level, 'L1');
    assert.equal(checkAuthority('apply-priority-rules').allowed, true);
    assert.equal(checkAuthority('prioritise-work').allowed, false);
    assert.equal(checkAuthority('set-any-priority-anyone').level, 'L4');
    assert.ok(CEO_AUTONOMY.every((g) => g.limits?.maxPriority === undefined));
  });

  it('is deterministic', () => {
    const a = decidePriority('The Moon checkout is down', 'critical');
    const b = decidePriority('The Moon checkout is down', 'critical');
    assert.deepEqual(a, b);
  });
});

describe('Work matching: precision over recall', () => {
  it('subject words drop brand names, generic words and tags', () => {
    assert.deepEqual([...subjectWords('[IT-TEST] Fix the Moon checkout page')], ['checkout']);
  });

  it('a brand word alone does not match unrelated Work', () => {
    const r = new InMemoryWorkRegistry();
    seed(r, 'Update product photos');
    const m = matchExistingWork(r, 'Fix the Moon checkout', Scopes.brand('moonglasses'));
    assert.equal(m.status, 'none');
    assert.equal(m.match, null);
  });

  it('one generic shared word does not attach; it is listed as similar', () => {
    const r = new InMemoryWorkRegistry();
    const b = seed(r, 'Redesign the homepage banner');
    const m = matchExistingWork(r, 'Add a banner to the checkout', Scopes.brand('moonglasses'));
    assert.equal(m.status, 'none');
    assert.deepEqual(m.similar.map((w) => w.id), [b.id]);
  });

  it('the same subject matches exactly', () => {
    const r = new InMemoryWorkRegistry();
    const w = seed(r, 'Fix Moon checkout page');
    const m = matchExistingWork(r, 'Handle the Moon checkout', Scopes.brand('moonglasses'));
    assert.equal(m.status, 'match');
    assert.equal(m.match?.id, w.id);
    assert.equal(m.candidates[0].basis, 'exact');
  });

  it('a strong overlap of several subject words matches', () => {
    const r = new InMemoryWorkRegistry();
    const w = seed(r, 'Checkout payment gateway timeout');
    const m = matchExistingWork(r, 'Checkout payment gateway timeout retries', Scopes.brand('moonglasses'));
    assert.equal(m.status, 'match');
    assert.equal(m.match?.id, w.id);
    assert.equal(m.candidates[0].basis, 'strong_title');
  });

  it('the same deployment target in the same brand matches on context', () => {
    const r = new InMemoryWorkRegistry();
    const w = seed(r, 'Set up the DNS for Moon');
    const m = matchExistingWork(r, 'Configure DNS records for Moon', Scopes.brand('moonglasses'));
    assert.equal(m.match?.id, w.id);
    assert.equal(m.candidates[0].basis, 'context');
  });

  it('Work in another brand never matches', () => {
    const r = new InMemoryWorkRegistry();
    seed(r, 'Fix Moon checkout page', 'moonglasses');
    assert.equal(matchExistingWork(r, 'Fix the checkout', Scopes.brand('caps')).status, 'none');
  });

  it('two plausible matches are ambiguous: the CEO asks and writes nothing', () => {
    const r = new InMemoryWorkRegistry();
    seed(r, 'Checkout payment gateway timeout');
    seed(r, 'Checkout payment gateway timeout retries');
    const before = r.list().map((i) => i.events.length);
    const out = run(r, 'Fix the checkout payment gateway timeout', { brand: 'moonglasses' });
    assert.equal(out.kind, 'clarification_needed');
    assert.equal(out.mutationApplied, false);
    assert.equal(out.operation, 'none');
    assert.equal(out.similarWork.length, 2);
    assert.deepEqual(r.list().map((i) => i.events.length), before);
    assert.equal(r.list().length, 2);
  });

  it('an explicit Work reference always wins, even over ambiguity', () => {
    const r = new InMemoryWorkRegistry();
    seed(r, 'Checkout payment gateway timeout');
    const second = seed(r, 'Checkout payment gateway timeout retries');
    const out = run(r, 'Fix the checkout payment gateway timeout', { brand: 'moonglasses', work_id: second.id });
    assert.equal(out.kind, 'work_updated');
    assert.equal(out.workItem?.id, second.id);
    assert.equal(r.list().length, 2);
  });

  it('a repeated identical request reuses the same Work; a genuinely new one creates new Work', () => {
    const r = new InMemoryWorkRegistry();
    const a = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    const b = run(r, 'Fix the Moon checkout', { brand: 'moonglasses' });
    assert.equal(b.workItem?.id, a.workItem?.id);
    const c = run(r, 'Update the product photos', { brand: 'moonglasses' });
    assert.equal(c.kind, 'work_created');
    assert.equal(r.list().length, 2);
  });

  it('closed and merged Work is never matched', () => {
    const r = new InMemoryWorkRegistry();
    const w = seed(r, 'Fix Moon checkout page');
    r.transition(w.id, 'triaged', CEO, { payload: { triage: { type: 'task', priority: 'P3', priority_reason: 'x', scope: Scopes.brand('moonglasses') } } });
    assert.equal(matchExistingWork(r, 'Fix the Moon checkout', Scopes.brand('moonglasses')).status, 'match');
  });

  it('scanning is bounded', () => {
    const r = new InMemoryWorkRegistry();
    for (let i = 0; i < 350; i++) seed(r, `Unrelated task number ${i} widget${i}`);
    const m = matchExistingWork(r, 'Something else entirely', Scopes.brand('moonglasses'));
    assert.equal(m.status, 'none');
    assert.ok(m.similar.length <= 3 && m.candidates.length <= 5);
  });
});

describe('Technical deployment routing: intent, not a keyword', () => {
  it('genuine deployment requests qualify, with their action, target and context', () => {
    assert.deepEqual(deploymentIntent('Integrate the new payment gateway and deploy it to production'), { action: 'integrate', target: 'payment gateway', production: true });
    assert.deepEqual(deploymentIntent('Set up the DNS for Moon'), { action: 'set up', target: 'dns', production: false });
    assert.equal(deploymentIntent('Deploy the Caps webhook')?.target, 'webhook');
    assert.equal(deploymentIntent('Rotate the Razorpay API key in production')?.production, true);
    assert.equal(deploymentIntent('Deploy the release to production')?.production, true);
  });

  it('the single word "integration" does not qualify', () => {
    assert.equal(deploymentIntent('Review our Stripe integration costs'), null);
    assert.equal(deploymentIntent('Integration campaign performance looks weak'), null);
    assert.equal(deploymentIntent('Fix the Moon integration campaign tracking'), null);
    assert.equal(deploymentIntent('Add a Stripe integration cost line to the report'), null);
  });

  it('technical-sounding but not deployment work does not qualify', () => {
    assert.equal(deploymentIntent('Integrate feedback from the Moon founder'), null);
    assert.equal(deploymentIntent('Release the new collection'), null);
    assert.equal(deploymentIntent('Deploy the new homepage banner'), null);
    assert.equal(deploymentIntent('Connect with the founder about the server costs'), null);
    assert.equal(deploymentIntent('Review the deploy plan for production'), null);
  });

  it('questions qualify only when they ask about a deployment target, not its cost or performance', () => {
    assert.equal(isDeploymentQuestion('What DNS records does Moon need?'), true);
    assert.equal(isDeploymentQuestion('How is the integration campaign performing?'), false);
    assert.equal(isDeploymentQuestion('What does the server cost?'), false);
  });

  it('a genuine request goes to the role and Virat approval; a broad "integration" request is ordinary Work', () => {
    const r = new InMemoryWorkRegistry();
    const dep = run(r, 'Integrate the new payment gateway and deploy it to production', { brand: 'moonglasses' });
    assert.equal(dep.routing?.role, 'technical_deployment_officer');
    assert.deepEqual(dep.routing?.currentHolders, ['Prince Keshri']);
    assert.ok(dep.routing?.basis.includes('production=true'));
    assert.equal(r.get(dep.workItem!.id)?.state, 'pending_approval');
    assert.equal(r.get(dep.workItem!.id)?.approval?.requested_from, 'virat');

    const plain = run(r, 'Fix the Moon integration campaign tracking', { brand: 'moonglasses' });
    assert.equal(plain.routing, null);
    assert.equal(plain.workItem?.state, 'assigned');
    assert.equal(plain.workItem?.owner?.id, 'MG-01');
  });
});
