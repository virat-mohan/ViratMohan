import { describe, expect, it } from 'vitest';
import { Scopes, validateQuantified } from '../../../src/lib/work';
import { CHECK, DEV, HEALTH, SG_CEO, code, makeRegistry, must, newItem } from './helpers';

const CLOSE = { closure: { method: 'watched checkout for a full cycle', evidence: [{ kind: 'metric' as const, ref: 'health:ok-x3', summary: 'three clean health runs' }] } };

function openIncident(priority: 'P0' | 'P1' | 'P3' = 'P1') {
  const ctx = makeRegistry();
  const { reg } = ctx;
  const a = must(reg.ingestSourceEvent({ channel: 'system_alert', external_ref: 'hc-1', fingerprint: 'checkout-5xx:sample', reporter: HEALTH, brand: 'sample', title: 'Checkout returns 500', summary: 'the health check failed', type_hint: 'incident' }));
  const id = a.item.id;
  must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority } } }));
  must(reg.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
  must(reg.transition(id, 'in_progress', SG_CEO));
  return { ...ctx, id };
}

describe('incident: a Work item of type "incident", not a separate system', () => {
  it('an incident starts with an empty record on the same canonical object', () => {
    const { reg, id } = openIncident();
    const it = reg.get(id)!;
    expect(it.type).toBe('incident');
    expect(it.level).toBe('work_item');
    expect(it.incident).toEqual({ diagnosis: null, tests: [], result: null, cost: null, revenue_impact: null, decision: null, prevention: [] });
    expect(newItem(makeRegistry().reg, { type: 'task' }).incident).toBeNull();
  });

  it('PROBLEM → DIAGNOSIS → OWNER → ACTIONS → EVIDENCE → TEST → RESULT → COST → REVENUE → CUSTOMER → DECISION → LEARNING → PREVENTION', () => {
    const { reg, id } = openIncident('P1');
    // problem + owner are the item itself
    expect(reg.get(id)!.description).toBe('the health check failed');
    expect(reg.get(id)!.owner?.id).toBe('SG-01');
    // actions and evidence
    const log = must(reg.addEvidence(id, { kind: 'log', ref: 'log:checkout/2026-10-05', summary: 'stack trace shows a null address' }, CHECK));
    const shot = must(reg.addEvidence(id, { kind: 'screenshot', ref: 'shot:checkout-error', summary: 'what the customer saw' }, CHECK));
    must(reg.logAction(id, { summary: 'rolled back the last deploy', evidence_ids: [log.id] }, SG_CEO));
    expect(reg.actionsOf(id).map((e) => e.data.summary)).toEqual(['rolled back the last deploy']);
    // diagnosis, test, result
    const deploy = must(reg.addEvidence(id, { kind: 'deploy', ref: 'deploy:prev', summary: 'previous deployment promoted' }, SG_CEO));
    must(reg.updateIncident(id, { diagnosis: 'A new optional field was read before it was set', result: 'Checkout completes again; rollback held for an hour', addTests: [{ description: 'Place a test order through checkout', result: 'pass', evidence_id: deploy.id }] }, SG_CEO));
    must(reg.updateFields(id, { customer_impact: 'Customers could not pay for about 40 minutes', revenue_profit_risk: { level: 'high', note: 'orders lost while down', quantified: { value: null, unit: 'INR', basis: 'unknown', source: null, note: 'order gap not yet measured' } } }, SG_CEO));
    must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'fixed', summary: 'Rolled back; fix queued as a follow-up item' } } }));
    must(reg.transition(id, 'verification', CHECK));
    // cost, revenue impact, decision, learning, prevention
    const follow = newItem(reg, { type: 'improvement', title: 'Add a checkout smoke test before deploy', scope: Scopes.retailOs('storefront') });
    must(reg.updateIncident(id, {
      cost: { value: 2, unit: 'hours', basis: 'measured', source: 'worklog 5 Oct' },
      revenue_impact: { value: null, unit: 'INR', basis: 'unknown', source: null, note: 'order gap not yet measured' },
      decision: 'Keep the rollback; ship the fix behind a smoke test',
      addPrevention: [{ action: 'Smoke-test checkout before every deploy', work_id: follow.id }],
    }, SG_CEO));
    must(reg.setLearning(id, { lesson: 'A field read before it is set only fails in the one path that skips the setter', reference: 'case-study/LEARNINGS.md', rule_added: true }, SG_CEO));
    const closed = must(reg.transition(id, 'closed', CHECK, { payload: CLOSE }));
    expect(closed.state).toBe('closed');
    expect(closed.incident?.decision).toMatchObject({ decision: expect.stringMatching(/rollback/), by: { id: 'SG-01' } });
    expect(closed.incident?.prevention[0].work_id).toBe(follow.id);
    expect(closed.evidence.map((e) => e.kind)).toEqual(expect.arrayContaining(['log', 'screenshot', 'deploy', 'metric']));
    expect(closed.incident?.tests[0]).toMatchObject({ result: 'pass', evidence_id: deploy.id });
    void shot;
  });

  it('cannot be resolved until it has a diagnosis, a passing test and a result', () => {
    const { reg, id } = openIncident();
    const R = { payload: { resolution: { kind: 'fixed' as const, summary: 'fixed' } } };
    expect(code(reg.transition(id, 'resolved', SG_CEO, R))).toBe('incident_incomplete');
    must(reg.updateIncident(id, { diagnosis: 'cause' }, SG_CEO));
    expect(code(reg.transition(id, 'resolved', SG_CEO, R))).toBe('incident_incomplete');
    must(reg.updateIncident(id, { addTests: [{ description: 't', result: 'fail' }] }, SG_CEO));
    expect(code(reg.transition(id, 'resolved', SG_CEO, R))).toBe('incident_incomplete');
    must(reg.updateIncident(id, { addTests: [{ description: 't2', result: 'pass' }], result: 'works' }, SG_CEO));
    expect(must(reg.transition(id, 'resolved', SG_CEO, R)).state).toBe('resolved');
  });

  const resolved = (priority: 'P0' | 'P1' | 'P3') => {
    const c = openIncident(priority);
    must(c.reg.updateIncident(c.id, { diagnosis: 'cause', result: 'works', addTests: [{ description: 't', result: 'pass' }] }, SG_CEO));
    must(c.reg.transition(c.id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'fixed', summary: 'fixed' } } }));
    must(c.reg.transition(c.id, 'verification', CHECK));
    return c;
  };

  it('every incident ends with one lesson ("every fix ends with one lesson")', () => {
    const { reg, id } = resolved('P3');
    expect(code(reg.transition(id, 'closed', CHECK, { payload: CLOSE }))).toBe('learning_required');
    must(reg.setLearning(id, { lesson: 'check the retry path', reference: null, rule_added: false }, SG_CEO));
    expect(must(reg.transition(id, 'closed', CHECK, { payload: CLOSE })).state).toBe('closed');
  });

  it('a P0/P1 incident also needs prevention and an explicit cost and revenue impact (a figure with a source, or honestly unknown)', () => {
    const { reg, id } = resolved('P0');
    must(reg.setLearning(id, { lesson: 'l', reference: null, rule_added: false }, SG_CEO));
    expect(code(reg.transition(id, 'closed', CHECK, { payload: CLOSE }))).toBe('prevention_required');
    must(reg.updateIncident(id, { addPrevention: [{ action: 'add a smoke test' }] }, SG_CEO));
    expect(code(reg.transition(id, 'closed', CHECK, { payload: CLOSE }))).toBe('incident_incomplete');
    must(reg.updateIncident(id, { cost: { value: null, unit: 'hours', basis: 'unknown', source: null } }, SG_CEO));
    expect(code(reg.transition(id, 'closed', CHECK, { payload: CLOSE }))).toBe('incident_incomplete');
    must(reg.updateIncident(id, { revenue_impact: { value: null, unit: 'INR', basis: 'unknown', source: null } }, SG_CEO));
    expect(must(reg.transition(id, 'closed', CHECK, { payload: CLOSE })).state).toBe('closed');
  });

  it('real numbers only: a figure must name its source; unknown carries no value; units are required', () => {
    expect(validateQuantified({ value: 5, unit: 'INR', basis: 'measured', source: null }, 'x').ok).toBe(false);
    expect(validateQuantified({ value: 5, unit: 'INR', basis: 'estimated', source: ' ' }, 'x').ok).toBe(false);
    expect(validateQuantified({ value: 5, unit: 'INR', basis: 'measured', source: 'orders table' }, 'x').ok).toBe(true);
    expect(validateQuantified({ value: 5, unit: 'INR', basis: 'unknown', source: null }, 'x').ok).toBe(false);
    expect(validateQuantified({ value: null, unit: 'INR', basis: 'unknown', source: null }, 'x').ok).toBe(true);
    expect(validateQuantified({ value: Number.NaN, unit: 'INR', basis: 'measured', source: 's' }, 'x').ok).toBe(false);
    expect(validateQuantified({ value: 1, unit: '', basis: 'measured', source: 's' }, 'x').ok).toBe(false);
    expect(validateQuantified(null, 'x')).toEqual({ ok: true, value: null });
    const { reg, id } = openIncident();
    expect(code(reg.updateIncident(id, { cost: { value: 100, unit: 'INR', basis: 'measured', source: '' } }, SG_CEO))).toBe('invalid_input');
    expect(code(reg.updateFields(id, { revenue_profit_risk: { level: 'high', note: null, quantified: { value: 9, unit: 'INR', basis: 'measured', source: null } } }, SG_CEO))).toBe('invalid_input');
  });

  it('only incidents have an incident record; test evidence must exist; blank fields are refused', () => {
    const { reg, id } = openIncident();
    expect(code(reg.updateIncident(newItem(reg).id, { diagnosis: 'x' }, DEV))).toBe('invalid_input');
    expect(code(reg.updateIncident(id, { addTests: [{ description: 't', result: 'pass', evidence_id: 'nope' }] }, SG_CEO))).toBe('invalid_input');
    expect(code(reg.updateIncident(id, { diagnosis: ' ' }, SG_CEO))).toBe('invalid_input');
    expect(code(reg.updateIncident(id, { addPrevention: [{ action: '' }] }, SG_CEO))).toBe('invalid_input');
    expect(code(reg.setLearning(id, { lesson: ' ', reference: null, rule_added: false }, SG_CEO))).toBe('invalid_input');
  });

  it('actions are recorded as events, in order, and never edited', () => {
    const { reg, id } = openIncident();
    must(reg.logAction(id, { summary: 'first' }, SG_CEO));
    must(reg.logAction(id, { summary: 'second' }, CHECK));
    expect(reg.actionsOf(id).map((e) => [e.actor.id, e.data.summary])).toEqual([['SG-01', 'first'], ['DS-10', 'second']]);
    expect(code(reg.logAction(id, { summary: ' ' }, SG_CEO))).toBe('invalid_input');
    expect(code(reg.logAction(id, { summary: 'x', evidence_ids: ['nope'] }, SG_CEO))).toBe('invalid_input');
  });

  it('reopening an incident keeps its record and its history', () => {
    const { reg, id } = resolved('P3');
    must(reg.setLearning(id, { lesson: 'l', reference: null, rule_added: false }, SG_CEO));
    must(reg.transition(id, 'closed', CHECK, { payload: CLOSE }));
    const r = must(reg.transition(id, 'reopened', DEV, { reason: 'it happened again' }));
    expect(r.incident?.diagnosis).toBe('cause');
    expect(r.events.filter((e) => e.kind === 'state_change').length).toBeGreaterThan(5);
    expect(must(reg.verifyAudit(id))).toEqual({ ok: true });
  });
});
