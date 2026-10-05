import { describe, expect, it } from 'vitest';
import { WORK_STATES, TRANSITIONS, type WorkState } from '../../../src/lib/work';
import { CHECK, DEV, PRINCE, SG_CEO, VIRAT, code, makeRegistry, must, newItem, reach } from './helpers';

const CLOSE = { closure: { method: 'checked the result', evidence: [{ kind: 'note' as const, ref: 'note:v', summary: 'verified' }] } };

describe('lifecycle: every ordered pair of states', () => {
  for (const from of WORK_STATES) {
    for (const to of WORK_STATES) {
      it(`${from} → ${to}`, () => {
        const { reg } = makeRegistry();
        const id = reach(reg, from);
        const before = reg.get(id)!;
        const legal = reg.legalNext(id).includes(to);
        const r = reg.transition(id, to, DEV);
        if (!legal) {
          expect(code(r)).toBe('illegal_transition');
          expect(reg.get(id)).toBe(before); // same object: nothing changed, nothing appended
        } else if (!r.ok) {
          expect(r.error.code).not.toBe('illegal_transition'); // legal moves may still be refused by a guard, never as "illegal"
          expect(reg.get(id)).toBe(before);
        }
      });
    }
  }

  it('the transition table covers every state', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...WORK_STATES].sort());
  });
});

describe('lifecycle: the happy path and the guards', () => {
  it('NEW → TRIAGED → ASSIGNED → IN PROGRESS → RESOLVED → VERIFICATION → CLOSED', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'fixed', summary: 'fixed it' } } }));
    expect(reg.get(id)!.state).toBe('resolved');
    must(reg.transition(id, 'verification', CHECK));
    const closed = must(reg.transition(id, 'closed', CHECK, { payload: CLOSE }));
    expect(closed.state).toBe('closed');
    expect(closed.closure?.verified_by.id).toBe('DS-10');
    expect(closed.closed_at).not.toBeNull();
  });

  it('RESOLVED is not CLOSED: a resolved item cannot be closed, and closing needs evidence', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'resolved');
    expect(code(reg.transition(id, 'closed', CHECK, { payload: CLOSE }))).toBe('illegal_transition');
    must(reg.transition(id, 'verification', CHECK));
    expect(code(reg.transition(id, 'closed', CHECK))).toBe('verification_required');
    expect(code(reg.transition(id, 'closed', CHECK, { payload: { closure: { method: 'looked', evidence: [] } } }))).toBe('verification_required');
    expect(code(reg.transition(id, 'closed', CHECK, { payload: { closure: { method: '', evidence: CLOSE.closure.evidence } } }))).toBe('verification_required');
    expect(code(reg.transition(id, 'closed', CHECK, { payload: { closure: { method: 'x', evidence: [{ kind: 'note', ref: '', summary: 's' }] } } }))).toBe('verification_required');
    expect(reg.get(id)!.state).toBe('verification');
  });

  it('closure evidence is stored on the item and linked from the closure record', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'verification');
    const c = must(reg.transition(id, 'closed', CHECK, { payload: CLOSE }));
    const ev = c.evidence.find((e) => e.id === c.closure!.evidence_ids[0])!;
    expect(ev.ref).toBe('note:v');
    expect(ev.by.id).toBe('DS-10');
  });

  it('P0/P1 work is verified by someone other than whoever resolved it; P3 may be self-verified', () => {
    const { reg } = makeRegistry();
    const p1 = newItem(reg);
    must(reg.transition(p1.id, 'triaged', DEV, { payload: { triage: { priority: 'P1' } } }));
    must(reg.transition(p1.id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
    must(reg.transition(p1.id, 'in_progress', SG_CEO));
    must(reg.transition(p1.id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'fixed', summary: 's' } } }));
    must(reg.transition(p1.id, 'verification', SG_CEO));
    expect(code(reg.transition(p1.id, 'closed', SG_CEO, { payload: CLOSE }))).toBe('verifier_must_differ');
    expect(must(reg.transition(p1.id, 'closed', CHECK, { payload: CLOSE })).state).toBe('closed');

    const p3 = reach(reg, 'resolved'); // resolved by SG_CEO, priority P3
    must(reg.transition(p3, 'verification', SG_CEO));
    expect(must(reg.transition(p3, 'closed', SG_CEO, { payload: CLOSE })).state).toBe('closed');
  });

  it('triage needs a priority, a valid type and scope; a lower-than-suggested priority needs a reason', () => {
    const { reg } = makeRegistry();
    const id = newItem(reg).id;
    expect(code(reg.transition(id, 'triaged', DEV))).toBe('triage_incomplete');
    expect(code(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P9' as never } } }))).toBe('triage_incomplete');
    expect(code(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3', type: 'nope' as never } } }))).toBe('triage_incomplete');
    const bad = { kind: 'brand' as const, brand: null, founder: null, system: null, extension: null };
    expect(code(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3', scope: bad } } }))).toBe('scope_invalid');
    const factors = { customerHarm: 'high' as const, revenueProfitRisk: 'none' as const, security: 'none' as const, operationalDisruption: 'none' as const, promiseRisk: 'none' as const, strategic: 'none' as const };
    expect(code(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3', factors } } }))).toBe('priority_override_needs_reason');
    const t = must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3', factors, priority_reason: 'customer already compensated' } } }));
    expect(t.priority).toBe('P3');
    expect(t.priority_reason).toBe('customer already compensated');
    expect(t.events.at(-1)!.data.suggested_priority).toBe('P1');
  });

  it('triage can reclassify the type, and the change is on the record', () => {
    const { reg } = makeRegistry();
    const id = newItem(reg, { type: 'alert' }).id;
    const t = must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P1', type: 'incident' } } }));
    expect(t.type).toBe('incident');
    expect(t.events.at(-1)!.data.type_from).toBe('alert');
  });

  it('assignment needs triage first and exactly one valid owner', () => {
    const { reg } = makeRegistry();
    const id = newItem(reg).id;
    must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    expect(code(reg.transition(id, 'assigned', DEV))).toBe('owner_required');
    expect(code(reg.transition(id, 'assigned', DEV, { payload: { owner: { kind: 'agent', id: 'NOPE-99' } } }))).toBe('owner_invalid');
    expect(code(reg.transition(id, 'in_progress', DEV))).toBe('illegal_transition');
  });

  it('holds: waiting needs "on"; blocked needs a blocker or reason; leaving blocked needs the blocker cleared', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'in_progress');
    expect(code(reg.transition(a, 'waiting', SG_CEO))).toBe('waiting_on_required');
    expect(code(reg.transition(a, 'blocked', SG_CEO))).toBe('blocker_required');
    must(reg.transition(a, 'waiting', SG_CEO, { payload: { waiting: { on: 'a supplier', until: '2026-10-09T00:00:00.000Z' } } }));
    expect(reg.get(a)!.waiting?.on).toBe('a supplier');
    must(reg.transition(a, 'in_progress', SG_CEO));
    expect(reg.get(a)!.waiting).toBeNull();
    expect(reg.get(a)!.held_from).toBeNull();
  });

  it('a hold resumes only to where it came from (or in progress, when there is an owner)', () => {
    const { reg } = makeRegistry();
    const id = newItem(reg).id;
    must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    must(reg.transition(id, 'waiting', DEV, { payload: { waiting: { on: 'the requester' } } }));
    expect(reg.legalNext(id)).toEqual(['triaged']); // no owner yet: cannot jump to in progress
    expect(code(reg.transition(id, 'in_progress', DEV))).toBe('illegal_transition');
    must(reg.transition(id, 'triaged', DEV));
  });

  it('resolving needs a resolution; duplicates are resolved by merging only', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(code(reg.transition(id, 'resolved', SG_CEO))).toBe('resolution_required');
    expect(code(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'fixed', summary: ' ' } } }))).toBe('resolution_required');
    expect(code(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'duplicate', summary: 'x' } } }))).toBe('resolution_required');
  });

  it('a parent cannot be resolved or closed while subordinate items are open', () => {
    const { reg } = makeRegistry();
    const parent = reach(reg, 'in_progress');
    const child = must(reg.createItem({ level: 'subtask', parent_id: parent, type: 'task', title: 'child', scope: reg.get(parent)!.scope }, DEV));
    expect(code(reg.transition(parent, 'resolved', SG_CEO, { payload: { resolution: { kind: 'completed', summary: 'done' } } }))).toBe('children_open');
    reach; // child is NEW: drive it to closed
    must(reg.transition(child.id, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    must(reg.transition(child.id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
    must(reg.transition(child.id, 'in_progress', SG_CEO));
    must(reg.transition(child.id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'completed', summary: 'ok' } } }));
    must(reg.transition(child.id, 'verification', CHECK));
    must(reg.transition(child.id, 'closed', CHECK, { payload: CLOSE }));
    expect(must(reg.transition(parent, 'resolved', SG_CEO, { payload: { resolution: { kind: 'completed', summary: 'done' } } })).state).toBe('resolved');
  });

  it('reopening needs a reason, resets resolution and closure, counts, and keeps the old closure in the trail', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'closed');
    expect(code(reg.transition(id, 'reopened', VIRAT))).toBe('reopen_reason_required');
    const r = must(reg.transition(id, 'reopened', VIRAT, { reason: 'the fix did not hold' }));
    expect([r.state, r.resolution, r.closure, r.closed_at, r.reopen_count]).toEqual(['reopened', null, null, null, 1]);
    const prev = r.events.at(-1)!.data.previous as { closure: { method: string } };
    expect(prev.closure.method).toBe('checked the result');
    expect(reg.legalNext(id)).toEqual(['triaged', 'assigned', 'in_progress']);
    must(reg.transition(id, 'in_progress', SG_CEO));
  });

  it('resolved and verification items can also be reopened', () => {
    const { reg } = makeRegistry();
    for (const s of ['resolved', 'verification'] as const) {
      const id = reach(reg, s);
      expect(must(reg.transition(id, 'reopened', VIRAT, { reason: 'not right' })).state).toBe('reopened');
    }
  });

  it('closed items accept no edits until reopened', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'closed');
    expect(code(reg.updateFields(id, { title: 'new' }, DEV))).toBe('closed_item');
    expect(code(reg.logAction(id, { summary: 'x' }, DEV))).toBe('closed_item');
    expect(code(reg.addSupporting(id, CHECK, DEV))).toBe('closed_item');
  });

  it('unknown ids and states fail safely', () => {
    const { reg } = makeRegistry();
    expect(code(reg.transition('nope', 'triaged', DEV))).toBe('not_found');
    const id = newItem(reg).id;
    expect(code(reg.transition(id, 'flying' as WorkState, DEV))).toBe('invalid_input');
    expect(code(reg.transition(id, 'triaged', undefined as never))).toBe('invalid_input');
  });

  it('Prince cannot be made owner by anyone but Virat (work for Prince is assigned by Virat)', () => {
    const { reg } = makeRegistry();
    const id = newItem(reg).id;
    must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    expect(code(reg.transition(id, 'assigned', DEV, { payload: { owner: PRINCE } }))).toBe('prince_requires_virat');
    expect(must(reg.transition(id, 'assigned', VIRAT, { payload: { owner: PRINCE } })).owner?.id).toBe('P-01');
  });
});
