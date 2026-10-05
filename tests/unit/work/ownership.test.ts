import { describe, expect, it } from 'vitest';
import { Scopes, actorIdLooksPersonal } from '../../../src/lib/work';
import { BOOKS, CARE, CHECK, DEV, GROW, KHIWANI, PRINCE, SG_CEO, VIRAT, XB_CEO, code, makeRegistry, must, newItem, reach } from './helpers';

describe('ownership: one work item, one accountable owner', () => {
  it('there is no owner until assignment, then exactly one', () => {
    const { reg } = makeRegistry();
    const id = newItem(reg).id;
    expect(reg.get(id)!.owner).toBeNull();
    must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    must(reg.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
    const it = reg.get(id)!;
    expect(it.owner?.id).toBe('SG-01');
    expect(Array.isArray(it.owner)).toBe(false);
  });

  it('reassigning replaces the owner: never two owners', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const r = must(reg.reassign(id, BOOKS, DEV, 'finance question'));
    expect(r.owner?.id).toBe('DS-13');
    expect(r.supporting.some((a) => a.id === 'SG-01')).toBe(false);
    expect(r.events.at(-1)).toMatchObject({ kind: 'owner_assigned', from: 'SG-01', to: 'DS-13', reason: 'finance question' });
  });

  it('reassigning can keep the previous owner on as supporting', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const r = must(reg.reassign(id, BOOKS, DEV, 'hand over', { keepPreviousAsSupporting: true }));
    expect(r.owner?.id).toBe('DS-13');
    expect(r.supporting.map((a) => a.id)).toEqual(['SG-01']);
  });

  it('reassign needs a reason and an assigned item', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(code(reg.reassign(id, BOOKS, DEV, ' '))).toBe('invalid_input');
    expect(code(reg.reassign(reach(reg, 'triaged'), BOOKS, DEV, 'x'))).toBe('owner_required');
  });

  it('several supporting agents are possible; observers can watch', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    must(reg.addSupporting(id, CHECK, DEV));
    must(reg.addSupporting(id, GROW, DEV));
    must(reg.addSupporting(id, BOOKS, DEV));
    must(reg.addObserver(id, VIRAT, DEV));
    must(reg.addObserver(id, CARE, DEV));
    const it = reg.get(id)!;
    expect(it.supporting.map((a) => a.id)).toEqual(['DS-10', 'DS-11', 'DS-13']);
    expect(it.observers.map((a) => a.id)).toEqual(['DS-00', 'DS-14']);
    expect(it.owner?.id).toBe('SG-01');
  });

  it('an actor holds one role on an item: no owner-and-supporting, no supporting-and-observer', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(code(reg.addSupporting(id, SG_CEO, DEV))).toBe('role_conflict');
    expect(code(reg.addObserver(id, SG_CEO, DEV))).toBe('role_conflict');
    must(reg.addSupporting(id, CHECK, DEV));
    expect(code(reg.addSupporting(id, CHECK, DEV))).toBe('role_conflict');
    expect(code(reg.addObserver(id, CHECK, DEV))).toBe('role_conflict');
    expect(code(reg.reassign(id, CHECK, DEV, 'x'))).toBe('role_conflict'); // already supporting: promote via lateral escalation
  });

  it('supporting can be removed; removing someone who is not supporting is refused', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    must(reg.addSupporting(id, CHECK, DEV));
    expect(must(reg.removeSupporting(id, CHECK, DEV)).supporting).toEqual([]);
    expect(code(reg.removeSupporting(id, CHECK, DEV))).toBe('invalid_input');
  });

  it('external people are escalation targets, never owners or supporting agents', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(code(reg.reassign(id, KHIWANI, DEV, 'x'))).toBe('owner_invalid');
    expect(code(reg.addSupporting(id, KHIWANI, DEV))).toBe('owner_invalid');
  });

  it('unknown org ids and the wrong kind are refused when a directory is supplied', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(code(reg.addSupporting(id, { kind: 'agent', id: 'ZZ-99' }, DEV))).toBe('owner_invalid');
    expect(code(reg.addSupporting(id, { kind: 'human', id: 'DS-10' }, DEV))).toBe('owner_invalid');
  });

  it('Prince gets work only through Virat: not as owner, not as supporting, unless Virat does it', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(code(reg.reassign(id, PRINCE, DEV, 'deploy'))).toBe('prince_requires_virat');
    expect(code(reg.addSupporting(id, PRINCE, DEV))).toBe('prince_requires_virat');
    expect(must(reg.addSupporting(id, PRINCE, VIRAT)).supporting.map((a) => a.id)).toEqual(['P-01']);
    // watching is not being given work
    expect(must(reg.addObserver(reach(reg, 'in_progress'), PRINCE, DEV)).observers.map((a) => a.id)).toEqual(['P-01']);
    const id2 = reach(reg, 'in_progress');
    expect(must(reg.reassign(id2, PRINCE, VIRAT, 'Virat assigns the deploy')).owner?.id).toBe('P-01');
  });

  it('a brand CEO owns the business outcome; a specialist owns an execution subtask beneath it', () => {
    const { reg } = makeRegistry();
    const parent = reach(reg, 'in_progress');
    const sub = must(reg.createItem({ level: 'subtask', parent_id: parent, type: 'task', title: 'Write the copy', scope: Scopes.brand('sample') }, SG_CEO));
    must(reg.transition(sub.id, 'triaged', SG_CEO, { payload: { triage: { priority: 'P3' } } }));
    must(reg.transition(sub.id, 'assigned', SG_CEO, { payload: { owner: GROW } }));
    expect(reg.get(parent)!.owner?.id).toBe('SG-01');
    expect(reg.get(sub.id)!.owner?.id).toBe('DS-11');
    expect(reg.children(parent).map((c) => c.id)).toEqual([sub.id]);
  });

  it('every ownership change is on the record with who made it', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    must(reg.addSupporting(id, CHECK, DEV));
    must(reg.reassign(id, BOOKS, VIRAT, 'move to finance'));
    const kinds = reg.get(id)!.events.filter((e) => ['owner_assigned', 'supporting_changed'].includes(e.kind)).map((e) => [e.kind, e.actor.id]);
    expect(kinds).toEqual([['supporting_changed', 'DS-02'], ['owner_assigned', 'DS-00']]);
  });

  it('the other brand CEO cannot be confused with this brand (identity is per actor id)', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(must(reg.addSupporting(id, XB_CEO, DEV)).supporting.map((a) => a.id)).toEqual(['XB-01']);
  });
});

describe('identifiers are references, never raw personal data', () => {
  it.each([['a@b.com', true], ['external:someone@gmail.com', true], ['+91 98765 43210', true], ['9876543210', true], ['external:+919876543210', true],
    ['DS-02', false], ['SG-01', false], ['external:founder:sample', false], ['external:khiwani', false], ['system:health-check', false], ['P-01', false]] as const)('%s → personal: %s', (id, personal) => {
    expect(actorIdLooksPersonal(id)).toBe(personal);
  });

  it('a request, a reporter or a creator with an email or phone as its id is refused, and nothing is stored', () => {
    const { reg } = makeRegistry();
    expect(code(reg.createItem({ type: 'task', title: 't', scope: Scopes.devshop() }, { kind: 'external', id: 'someone@example.com' }))).toBe('invalid_input');
    expect(code(reg.createItem({ type: 'task', title: 't', scope: Scopes.devshop(), source: { requester: { kind: 'external', id: '+91 98765 43210' } } }, DEV))).toBe('invalid_input');
    expect(code(reg.ingestSourceEvent({ channel: 'whatsapp', external_ref: 'x', reporter: { kind: 'external', id: '9876543210' }, title: 't', summary: 's' }))).toBe('invalid_input');
    expect(reg.list()).toEqual([]);
    expect(reg.allSourceEvents()).toEqual([]);
  });
});
