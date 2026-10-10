import { describe, expect, it } from 'vitest';
import { type HumanEscalationInput } from '../../../src/lib/work';
import { BOOKS, CHECK, DEV, FOUNDER, GROW, KHIWANI, LEGAL, OTHER_FOUNDER, PRINCE, SG_CEO, VIRAT, code, makeRegistry, must, reach } from './helpers';

const ESC = (ids: string[], over: Partial<HumanEscalationInput> = {}): HumanEscalationInput => ({
  to: 'khiwani', coverage_gap: 'coverage', what_happened: 'A settlement figure may include GST twice', evidence_ids: ids,
  impact: 'Founder may be over-paid by an unknown amount', risk: 'Wrong tax treatment if left', tried: ['Re-ran the statement', 'Checked the invoice lines'],
  decision_required: 'Is GST treated correctly on this line?', recommended_action: 'Confirm treatment, then re-issue the statement', ...over,
});
const withEvidence = (reg: ReturnType<typeof makeRegistry>['reg'], id: string) => must(reg.addEvidence(id, { kind: 'note', ref: 'statement:oct', summary: 'the statement' }, SG_CEO)).id;

describe('human escalation: authority or coverage is missing', () => {
  it('captures what happened, evidence, impact, risk, what was tried, the decision required, the recommendation and the owner', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const ev = withEvidence(reg, id);
    const it = must(reg.escalateToHuman(id, ESC([ev]), SG_CEO));
    const e = it.escalations.at(-1)!;
    expect(e).toMatchObject({ kind: 'human', to: 'khiwani', coverage_gap: 'coverage', owner: { id: 'SG-01' }, evidence_ids: [ev] });
    if (e.kind === 'human') {
      expect(e.what_happened).toMatch(/GST/);
      expect(e.tried).toHaveLength(2);
      expect(e.decision_required).toMatch(/GST/);
      expect(e.recommended_action).toMatch(/re-issue/);
    }
    expect(it.events.some((x) => x.kind === 'escalated_human' && x.to === 'khiwani')).toBe(true);
  });

  it('the accountable owner stays accountable and the item holds (WAITING on the human) until they answer', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const it = must(reg.escalateToHuman(id, ESC([withEvidence(reg, id)]), SG_CEO));
    expect(it.owner?.id).toBe('SG-01');
    expect(it.state).toBe('waiting');
    expect(it.waiting?.on).toBe('Khiwani & Co.');
    expect(reg.awaitingHuman().map((g) => [g.coverage, g.items.map((i) => i.id)])).toEqual([['khiwani', [id]]]);
  });

  it('each missing piece is named and nothing changes', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const ev = withEvidence(reg, id);
    const before = reg.get(id)!;
    for (const [k, v] of [['what_happened', ''], ['impact', ' '], ['risk', ''], ['decision_required', ''], ['recommended_action', ''], ['evidence_ids', []], ['tried', []], ['tried', [' ']]] as const) {
      const r = reg.escalateToHuman(id, ESC([ev], { [k]: v } as Partial<HumanEscalationInput>), SG_CEO);
      expect(code(r), String(k)).toBe('escalation_incomplete');
    }
    expect(code(reg.escalateToHuman(id, ESC([ev], { to: 'nobody' as never }), SG_CEO))).toBe('escalation_incomplete');
    expect(code(reg.escalateToHuman(id, ESC(['not-evidence']), SG_CEO))).toBe('escalation_incomplete');
    expect(reg.get(id)).toBe(before);
  });

  it('only the five human coverages exist, and Prince is reached through Virat', () => {
    const { reg } = makeRegistry();
    for (const to of ['virat', 'khiwani', 'legal', 'brand_founder'] as const) {
      const id = reach(reg, 'in_progress');
      expect(must(reg.escalateToHuman(id, ESC([withEvidence(reg, id)], { to }), SG_CEO)).escalations.at(-1)).toMatchObject({ to });
    }
    const id = reach(reg, 'in_progress');
    const ev = withEvidence(reg, id);
    expect(code(reg.escalateToHuman(id, ESC([ev], { to: 'prince' }), SG_CEO))).toBe('prince_requires_virat');
    expect(must(reg.escalateToHuman(id, ESC([ev], { to: 'prince' }), VIRAT)).escalations.at(-1)).toMatchObject({ to: 'prince' });
  });

  it('only the owner, a supporting agent or Virat escalates; an unassigned item cannot', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const ev = withEvidence(reg, id);
    expect(code(reg.escalateToHuman(id, ESC([ev]), GROW))).toBe('not_permitted');
    expect(code(reg.escalateToHuman(reach(reg, 'triaged'), ESC(['x']), DEV))).toBe('owner_required');
    must(reg.addSupporting(id, CHECK, DEV));
    expect(must(reg.escalateToHuman(id, ESC([ev]), CHECK)).state).toBe('waiting');
  });

  it('an item already blocked or waiting keeps its state', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'blocked');
    const it = must(reg.escalateToHuman(id, ESC([withEvidence(reg, id)]), SG_CEO));
    expect(it.state).toBe('blocked');
    expect(it.escalations.length).toBe(1);
  });
});

describe('lateral escalation: straight to the specialist', () => {
  it('accountability moves directly; the previous owner stays on as supporting; no one in between is involved', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const it = must(reg.escalateLateral(id, BOOKS, SG_CEO, 'this is a finance question'));
    expect(it.owner?.id).toBe('DS-13');
    expect(it.supporting.map((a) => a.id)).toEqual(['SG-01']);
    expect(it.escalations.at(-1)).toMatchObject({ kind: 'lateral', from: { id: 'SG-01' }, to: { id: 'DS-13' }, reason: 'this is a finance question' });
    expect(it.events.some((e) => e.actor.id === 'DS-02')).toBe(true); // creation by Dev only; nobody climbed the hierarchy after
    expect(it.events.filter((e) => e.kind.startsWith('escalated') || e.kind === 'owner_assigned').every((e) => e.actor.id === 'SG-01')).toBe(true);
  });

  it('a supporting specialist can be promoted to owner', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    must(reg.addSupporting(id, BOOKS, DEV));
    const it = must(reg.escalateLateral(id, BOOKS, SG_CEO, 'over to Books'));
    expect(it.owner?.id).toBe('DS-13');
    expect(it.supporting.map((a) => a.id)).toEqual(['SG-01']);
  });

  it('there is still exactly one owner afterwards, and Prince is only ever reached through Virat', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(code(reg.escalateLateral(id, PRINCE, SG_CEO, 'deploy'))).toBe('prince_requires_virat');
    const out = must(reg.escalateLateral(id, PRINCE, VIRAT, 'Virat sends this to Prince'));
    expect(out.owner?.id).toBe('P-01');
    expect(out.supporting.map((a) => a.id)).toEqual(['SG-01']);
  });

  it('refuses a stranger, no reason, an external person, and an unassigned item', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    expect(code(reg.escalateLateral(id, BOOKS, GROW, 'x'))).toBe('not_permitted');
    expect(code(reg.escalateLateral(id, BOOKS, SG_CEO, ' '))).toBe('escalation_incomplete');
    expect(code(reg.escalateLateral(id, KHIWANI, SG_CEO, 'x'))).toBe('owner_invalid');
    expect(code(reg.escalateLateral(reach(reg, 'triaged'), BOOKS, DEV, 'x'))).toBe('owner_required');
  });
});

describe('approvals', () => {
  const req = (ids: string[], over = {}) => ({ requested_from: 'virat' as const, authority: 'pricing' as const, reason: 'Bundle price below cost', evidence_ids: ids, recommendation: 'Approve a 10% bundle discount', ...over });

  it('a request needs a reason, a recommendation and evidence, and the right approver for the authority', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const ev = withEvidence(reg, id);
    expect(code(reg.requestApproval(id, req([ev], { reason: ' ' }), SG_CEO))).toBe('approval_invalid');
    expect(code(reg.requestApproval(id, req([ev], { recommendation: '' }), SG_CEO))).toBe('approval_invalid');
    expect(code(reg.requestApproval(id, req([]), SG_CEO))).toBe('approval_invalid');
    expect(code(reg.requestApproval(id, req(['nope']), SG_CEO))).toBe('approval_invalid');
    expect(code(reg.requestApproval(id, req([ev], { requested_from: 'khiwani' }), SG_CEO))).toBe('approval_invalid'); // pricing is Virat's
    expect(code(reg.requestApproval(id, req([ev], { authority: 'sorcery' as never }), SG_CEO))).toBe('approval_invalid');
    expect(code(reg.requestApproval(id, req([ev]), GROW))).toBe('not_permitted');
    expect(reg.get(id)!.state).toBe('in_progress');
  });

  it('requesting puts the item in PENDING APPROVAL with who, authority, reason, evidence and recommendation', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const ev = withEvidence(reg, id);
    const it = must(reg.requestApproval(id, req([ev]), SG_CEO));
    expect(it.state).toBe('pending_approval');
    expect(it.approval).toMatchObject({ requested_by: { id: 'SG-01' }, requested_from: 'virat', authority: 'pricing', reason: 'Bundle price below cost', evidence_ids: [ev], recommendation: 'Approve a 10% bundle discount', decision: null });
    expect(it.events.slice(-2).map((e) => e.kind)).toEqual(['approval_requested', 'state_change']);
  });

  it('a request the item cannot hold for saves nothing: no approval record, no request event', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'resolved'); // owned, but a resolved item cannot go to pending approval
    const ev = must(reg.addEvidence(id, { kind: 'note', ref: 'n', summary: 's' }, SG_CEO));
    const before = reg.get(id)!;
    expect(code(reg.requestApproval(id, req([ev.id]), SG_CEO))).toBe('illegal_transition');
    expect(reg.get(id)).toBe(before);
    expect(reg.get(id)!.approval).toBeNull();
    expect(reg.get(id)!.events.some((e) => e.kind === 'approval_requested')).toBe(false);
    // and an unowned item cannot ask at all
    const fresh = reach(reg, 'new');
    expect(code(reg.requestApproval(fresh, req([ev.id]), DEV))).toBe('not_permitted');
  });

  it('agents cannot approve; the wrong person cannot approve; only the requested authority holder can', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    must(reg.requestApproval(id, req([withEvidence(reg, id)]), SG_CEO));
    expect(code(reg.decideApproval(id, 'approved', DEV))).toBe('approval_not_allowed');
    expect(code(reg.decideApproval(id, 'approved', SG_CEO))).toBe('approval_not_allowed'); // not even the requester
    expect(code(reg.decideApproval(id, 'approved', { kind: 'system', id: 'system:cron' }))).toBe('approval_not_allowed');
    expect(code(reg.decideApproval(id, 'approved', PRINCE))).toBe('approval_not_allowed');
    expect(code(reg.decideApproval(id, 'approved', KHIWANI))).toBe('approval_not_allowed');
    expect(code(reg.decideApproval(id, 'approved', { kind: 'human', id: 'DS-01' }))).toBe('approval_not_allowed'); // impersonating a person
    expect(reg.get(id)!.state).toBe('pending_approval');
  });

  it('Virat approves: the decision (who, when, authority) is recorded and kept; work resumes where it was held', () => {
    const { reg, tick } = makeRegistry();
    const id = reach(reg, 'in_progress');
    must(reg.requestApproval(id, req([withEvidence(reg, id)]), SG_CEO));
    tick(60_000);
    const { item, resumed } = must(reg.decideApproval(id, 'approved', VIRAT, 'fine for October'));
    expect(resumed).toBe(true);
    expect(item.state).toBe('in_progress');
    expect(item.approval?.decision).toMatchObject({ outcome: 'approved', by: { id: 'DS-00' }, note: 'fine for October' });
    expect(Date.parse(item.approval!.decision!.at)).toBeGreaterThan(Date.parse(item.approval!.requested_at));
    const decided = item.events.find((e) => e.kind === 'approval_decided')!;
    expect(decided).toMatchObject({ actor: { id: 'DS-00' }, to: 'approved', reason: 'fine for October', data: { authority: 'pricing', requested_from: 'virat' } });
    expect(item.events.at(-1)).toMatchObject({ kind: 'state_change', from: 'pending_approval', to: 'in_progress', reason: 'approval approved' });
  });

  it('a rejection needs a note and returns the item to its owner, who can then resolve it as declined', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    must(reg.requestApproval(id, req([withEvidence(reg, id)]), SG_CEO));
    expect(code(reg.decideApproval(id, 'rejected', VIRAT))).toBe('approval_invalid');
    const { item } = must(reg.decideApproval(id, 'rejected', VIRAT, 'margin too thin'));
    expect(item.approval?.decision?.outcome).toBe('rejected');
    expect(item.state).toBe('in_progress');
    must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'declined', summary: 'Virat declined: margin too thin' } } }));
  });

  it('a decision is final and needs a pending request; leaving PENDING APPROVAL needs a decision', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'pending_approval');
    expect(code(reg.transition(id, 'in_progress', SG_CEO))).toBe('approval_decision_required');
    expect(reg.legalNext(id)).toEqual(['assigned', 'in_progress'].filter((s) => reg.legalNext(id).includes(s as never)));
    must(reg.decideApproval(id, 'approved', VIRAT));
    expect(code(reg.decideApproval(id, 'approved', VIRAT))).toBe('approval_invalid');
    expect(code(reg.decideApproval(reach(reg, 'in_progress'), 'approved', VIRAT))).toBe('approval_invalid');
    expect(code(reg.decideApproval(id, 'maybe' as never, VIRAT))).toBe('approval_invalid');
  });

  it('a held-from-triage item returns to triage; and a later approval does not erase the earlier one from the record', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'assigned');
    must(reg.requestApproval(id, req([withEvidence(reg, id)]), SG_CEO));
    must(reg.decideApproval(id, 'approved', VIRAT));
    expect(reg.get(id)!.state).toBe('assigned'); // held from assigned
    must(reg.requestApproval(id, req([withEvidence(reg, id)], { authority: 'outbound_comms', reason: 'Send the note to the founder', recommendation: 'Send' }), SG_CEO));
    expect(reg.get(id)!.approval?.authority).toBe('outbound_comms');
    expect(reg.get(id)!.events.filter((e) => e.kind === 'approval_decided').length).toBe(1);
    expect(reg.get(id)!.events.filter((e) => e.kind === 'approval_requested').length).toBe(2);
  });

  it('specialist authorities go to the right person: tax to Khiwani, legal to the legal advisers, brand facts to that brand\'s founder', () => {
    const { reg } = makeRegistry();
    const tax = reach(reg, 'in_progress');
    must(reg.requestApproval(tax, req([withEvidence(reg, tax)], { requested_from: 'khiwani', authority: 'accounting_tax', reason: 'GST treatment' }), SG_CEO));
    expect(code(reg.decideApproval(tax, 'approved', LEGAL))).toBe('approval_not_allowed');
    expect(must(reg.decideApproval(tax, 'approved', KHIWANI, 'treatment is correct')).item.approval?.decision?.by.id).toBe('external:khiwani');

    const legal = reach(reg, 'in_progress');
    must(reg.requestApproval(legal, req([withEvidence(reg, legal)], { requested_from: 'legal', authority: 'legal_opinion', reason: 'clause check' }), SG_CEO));
    expect(must(reg.decideApproval(legal, 'approved', LEGAL)).item.state).toBe('in_progress');

    const brand = reach(reg, 'in_progress');
    must(reg.requestApproval(brand, req([withEvidence(reg, brand)], { requested_from: 'brand_founder', authority: 'brand_judgement', reason: 'is this stock figure right' }), SG_CEO));
    expect(code(reg.decideApproval(brand, 'approved', OTHER_FOUNDER))).toBe('approval_not_allowed'); // another brand's founder
    expect(must(reg.decideApproval(brand, 'approved', FOUNDER)).item.approval?.decision?.by.id).toBe('external:founder:sample');
  });

  it('Virat may decide a specialist authority too (founder authority); the Virat-only ones are Virat\'s alone', () => {
    const { reg } = makeRegistry();
    const tax = reach(reg, 'in_progress');
    must(reg.requestApproval(tax, req([withEvidence(reg, tax)], { requested_from: 'virat', authority: 'accounting_tax' }), SG_CEO));
    expect(must(reg.decideApproval(tax, 'approved', VIRAT)).resumed).toBe(true);
    const price = reach(reg, 'in_progress');
    expect(code(reg.requestApproval(price, req([withEvidence(reg, price)], { requested_from: 'khiwani', authority: 'money' }), SG_CEO))).toBe('approval_invalid');
    expect(code(reg.requestApproval(price, req([withEvidence(reg, price)], { requested_from: 'prince', authority: 'terms_legal' }), SG_CEO))).toBe('approval_invalid');
  });

  it('what waits on whom is one query away', () => {
    const { reg } = makeRegistry();
    const a = reach(reg, 'in_progress');
    must(reg.requestApproval(a, req([withEvidence(reg, a)]), SG_CEO));
    const b = reach(reg, 'in_progress');
    must(reg.escalateToHuman(b, ESC([withEvidence(reg, b)]), SG_CEO));
    const view = Object.fromEntries(reg.awaitingHuman().map((g) => [g.coverage, g.items.map((i) => i.id)]));
    expect(view).toEqual({ virat: [a], khiwani: [b] });
    must(reg.decideApproval(a, 'approved', VIRAT));
    expect(reg.awaitingHuman().map((g) => g.coverage)).toEqual(['khiwani']);
  });
});
