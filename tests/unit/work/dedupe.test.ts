import { describe, expect, it } from 'vitest';
import { jaccard, tokens, Scopes } from '../../../src/lib/work';
import { BOOKS, CHECK, DEV, FOUNDER, HEALTH, OTHER_FOUNDER, PRINCE, SG_CEO, VIRAT, code, makeRegistry, must, newItem, reach } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const ask = (over: Record<string, unknown> = {}) => ({
  channel: 'command_centre' as const, external_ref: 'cc-1', reporter: FOUNDER, brand: 'sample',
  title: 'Add a size chart to the product pages', summary: 'Customers keep asking which size to pick, please add a size chart to each product page', ...over,
});
const ask2 = (over: Record<string, unknown> = {}) => ({
  channel: 'whatsapp' as const, external_ref: 'wa-1', reporter: FOUNDER, brand: 'sample',
  title: 'Size chart on the product pages', summary: 'Customers keep asking which size to pick, please add a size chart to each product page', ...over,
});

describe('source events → one canonical work item', () => {
  it('the same report again (same channel and reference) is the same event: nothing new is created', () => {
    const { reg } = makeRegistry();
    const a = must(reg.ingestSourceEvent(ask()));
    const b = must(reg.ingestSourceEvent(ask()));
    expect(a.outcome).toBe('created');
    expect(b.outcome).toBe('duplicate_event');
    expect(b.item.id).toBe(a.item.id);
    expect(reg.list().length).toBe(1);
    expect(reg.allSourceEvents().length).toBe(1);
  });

  it('a reply in the same thread attaches to the open item', () => {
    const { reg } = makeRegistry();
    const a = must(reg.ingestSourceEvent(ask({ channel: 'brand_support_email', external_ref: 'm1', thread_ref: 't-9' })));
    const b = must(reg.ingestSourceEvent(ask({ channel: 'brand_support_email', external_ref: 'm2', thread_ref: 't-9', title: 'Re: size chart', summary: 'any update?' })));
    expect(b.outcome).toBe('attached');
    expect(b.item.id).toBe(a.item.id);
    expect(reg.get(a.item.id)!.source_event_ids.length).toBe(2);
    expect(reg.list().length).toBe(1);
  });

  it('the same fingerprint from a detector and an agent, on different channels, is one item', () => {
    const { reg } = makeRegistry();
    const a = must(reg.ingestSourceEvent({ channel: 'system_alert', external_ref: 'hc-1', fingerprint: 'checkout-5xx:sample', reporter: HEALTH, brand: 'sample', title: 'Checkout returning 500', summary: 'health check failed' }));
    const b = must(reg.ingestSourceEvent({ channel: 'agent_detection', external_ref: 'ag-7', fingerprint: 'checkout-5xx:sample', reporter: CHECK, brand: 'sample', title: 'Checkout errors seen', summary: 'seen again' }));
    expect(b.outcome).toBe('attached');
    expect(b.item.id).toBe(a.item.id);
    expect(reg.sourceEventsOf(a.item.id).map((e) => e.channel)).toEqual(['system_alert', 'agent_detection']);
  });

  it('three reports of one issue (alert, WhatsApp thread, email thread) resolve to ONE open item', () => {
    const { reg } = makeRegistry();
    must(reg.ingestSourceEvent({ channel: 'system_alert', external_ref: 'a1', fingerprint: 'fp-1', reporter: HEALTH, brand: 'sample', title: 'Orders not syncing', summary: 'sync job failed' }));
    must(reg.ingestSourceEvent({ channel: 'whatsapp', external_ref: 'w1', thread_ref: 'w-t', fingerprint: 'fp-1', reporter: FOUNDER, brand: 'sample', title: 'My orders are missing', summary: 'founder asks' }));
    must(reg.ingestSourceEvent({ channel: 'whatsapp', external_ref: 'w2', thread_ref: 'w-t', reporter: FOUNDER, brand: 'sample', title: 'Any news?', summary: 'still missing' }));
    must(reg.ingestSourceEvent({ channel: 'brand_support_email', external_ref: 'e1', fingerprint: 'fp-1', reporter: FOUNDER, brand: 'sample', title: 'Order sync problem', summary: 'email' }));
    expect(reg.list({ openOnly: true }).length).toBe(1);
    expect(reg.list()[0].source_event_ids.length).toBe(4);
  });

  it('a similar report is UNCERTAIN: it becomes its own item, linked as a possible duplicate, never auto-merged', () => {
    const { reg } = makeRegistry();
    const a = must(reg.ingestSourceEvent(ask()));
    const b = must(reg.ingestSourceEvent(ask2()));
    expect(b.outcome).toBe('possible_duplicate');
    expect(b.item.id).not.toBe(a.item.id);
    expect(b.candidates[0].id).toBe(a.item.id);
    expect(b.candidates[0].score).toBeGreaterThanOrEqual(0.6);
    expect(reg.list().length).toBe(2);
    expect(reg.get(b.item.id)!.merged_into).toBeNull();
    expect(reg.possibleDuplicatesOf(b.item.id).map((l) => l.to)).toEqual([a.item.id]);
    expect(reg.get(b.item.id)!.events.some((e) => e.kind === 'link_added' && e.data.kind === 'possible_duplicate')).toBe(true);
  });

  it('unrelated reports stay separate', () => {
    const { reg } = makeRegistry();
    must(reg.ingestSourceEvent(ask()));
    const c = must(reg.ingestSourceEvent(ask2({ title: 'Refund is delayed for one order', summary: 'a buyer is waiting for money back since last week' })));
    expect(c.outcome).toBe('created');
    expect(reg.list().length).toBe(2);
  });

  it('similar text is not suggested across brands, across types, or outside the time window', () => {
    const { reg, tick } = makeRegistry();
    must(reg.ingestSourceEvent(ask()));
    expect(must(reg.ingestSourceEvent(ask2({ brand: 'other', reporter: OTHER_FOUNDER }))).outcome).toBe('created');
    expect(must(reg.ingestSourceEvent(ask2({ external_ref: 'wa-2', type_hint: 'incident' }))).outcome).toBe('created');
    tick(8 * DAY);
    expect(must(reg.ingestSourceEvent(ask2({ external_ref: 'wa-3' }))).outcome).toBe('created');
  });

  it('the threshold and window are parameters, not facts: a borderline pair is flagged only when the threshold is lowered', () => {
    const borderline = ask2({ title: 'Size chart on product pages', summary: 'please help' }); // shares roughly a third of its words
    const strict = makeRegistry();
    must(strict.reg.ingestSourceEvent(ask()));
    expect(must(strict.reg.ingestSourceEvent(borderline)).outcome).toBe('created');
    const loose = makeRegistry({ dedupePolicy: { similarityThreshold: 0.3 } });
    must(loose.reg.ingestSourceEvent(ask()));
    expect(must(loose.reg.ingestSourceEvent(borderline)).outcome).toBe('possible_duplicate');
    const narrow = makeRegistry({ dedupePolicy: { windowMs: 1000 } });
    must(narrow.reg.ingestSourceEvent(ask()));
    narrow.tick(5000);
    expect(must(narrow.reg.ingestSourceEvent(ask2())).outcome).toBe('created');
  });

  it('a report matching a CLOSED item is flagged as a possible regression, never attached to it', () => {
    const { reg } = makeRegistry();
    const a = must(reg.ingestSourceEvent({ channel: 'system_alert', external_ref: 'a1', fingerprint: 'fp-r', reporter: HEALTH, brand: 'sample', title: 'Checkout down', summary: 'x' }));
    const id = a.item.id;
    must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P1' } } }));
    must(reg.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
    must(reg.transition(id, 'in_progress', SG_CEO));
    must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'fixed', summary: 'x' } } }));
    must(reg.transition(id, 'verification', CHECK));
    must(reg.transition(id, 'closed', CHECK, { payload: { closure: { method: 'm', evidence: [{ kind: 'note', ref: 'r', summary: 's' }] } } }));
    const again = must(reg.ingestSourceEvent({ channel: 'system_alert', external_ref: 'a2', fingerprint: 'fp-r', reporter: HEALTH, brand: 'sample', title: 'Checkout down', summary: 'again' }));
    expect(again.outcome).toBe('possible_duplicate');
    expect(again.candidates[0]).toMatchObject({ id, closed: true });
    expect(again.item.id).not.toBe(id);
  });

  it('bad input fails safely: unknown channel, unknown brand, missing reference or title', () => {
    const { reg } = makeRegistry();
    expect(code(reg.ingestSourceEvent(ask({ channel: 'fax' as never })))).toBe('invalid_input');
    expect(code(reg.ingestSourceEvent(ask({ brand: 'nobody' })))).toBe('unknown_brand');
    expect(code(reg.ingestSourceEvent(ask({ external_ref: ' ' })))).toBe('invalid_input');
    expect(code(reg.ingestSourceEvent(ask({ title: '' })))).toBe('invalid_input');
    expect(reg.list().length).toBe(0);
  });

  it('tokenising and similarity are deterministic', () => {
    expect([...tokens('The size, chart & the PAGES!')].sort()).toEqual(['chart', 'pages', 'size']);
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });
});

describe('merging duplicates', () => {
  const pair = () => {
    const ctx = makeRegistry();
    const a = must(ctx.reg.ingestSourceEvent(ask()));
    const b = must(ctx.reg.ingestSourceEvent(ask2()));
    return { ...ctx, a: a.item.id, b: b.item.id };
  };

  it('confirming a possible duplicate merges it: one canonical item holds both reports', () => {
    const { reg, a, b } = pair();
    must(reg.transition(a, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    const { canonical, duplicate } = must(reg.mergeInto(b, a, DEV, 'same request from two channels'));
    expect(canonical.id).toBe(a);
    expect(canonical.source_event_ids.length).toBe(2);
    expect(reg.sourceEventsOf(a).map((e) => e.channel).sort()).toEqual(['command_centre', 'whatsapp']);
    expect(duplicate).toMatchObject({ state: 'closed', merged_into: a });
    expect(duplicate.resolution).toMatchObject({ kind: 'duplicate', merged_into: a });
    expect(duplicate.closure?.method).toBe('merged into the canonical item');
    expect(reg.list({ openOnly: true }).map((i) => i.id)).toEqual([a]);
    expect(reg.possibleDuplicatesOf(b)).toEqual([]);
    expect(canonical.events.at(-1)).toMatchObject({ kind: 'merged_from', reason: 'same request from two channels' });
    expect(duplicate.events.map((e) => e.kind).slice(-2)).toEqual(['state_change', 'merged_into']);
  });

  it('new reports on the duplicate\'s old thread now land on the canonical item', () => {
    const { reg, a, b } = pair();
    must(reg.ingestSourceEvent(ask2({ external_ref: 'wa-x', thread_ref: 'wt-1', title: 'First message', summary: 'zzz yyy' })));
    const t = reg.list().find((i) => i.title === 'First message')!;
    must(reg.mergeInto(t.id, a, DEV, 'same'));
    const follow = must(reg.ingestSourceEvent(ask2({ external_ref: 'wa-y', thread_ref: 'wt-1', title: 'Follow up', summary: 'any news' })));
    expect(follow.outcome).toBe('attached');
    expect(follow.item.id).toBe(a);
    void b;
  });

  it('the duplicate\'s people stay on the canonical item; the owner stays the canonical owner; the more urgent priority wins', () => {
    const { reg, a, b } = pair();
    must(reg.transition(a, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    must(reg.transition(a, 'assigned', DEV, { payload: { owner: SG_CEO } }));
    must(reg.transition(b, 'triaged', DEV, { payload: { triage: { priority: 'P1' } } }));
    must(reg.transition(b, 'assigned', DEV, { payload: { owner: BOOKS } }));
    must(reg.addObserver(b, VIRAT, DEV));
    const { canonical } = must(reg.mergeInto(b, a, DEV, 'same'));
    expect(canonical.owner?.id).toBe('SG-01');
    expect(canonical.supporting.map((x) => x.id)).toEqual(['DS-13']);
    expect(canonical.observers.map((x) => x.id)).toEqual(['DS-00']);
    expect(canonical.priority).toBe('P1');
  });

  it('merging never hands Prince work: he joins only as an observer unless Virat merges', () => {
    const { reg, a, b } = pair();
    must(reg.transition(b, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    must(reg.transition(b, 'assigned', VIRAT, { payload: { owner: PRINCE } }));
    const { canonical } = must(reg.mergeInto(b, a, DEV, 'same'));
    expect(canonical.supporting.some((x) => x.id === 'P-01')).toBe(false);
    expect(canonical.observers.map((x) => x.id)).toContain('P-01');
  });

  it('the earlier deadline (the tighter promise) is kept', () => {
    const { reg, a, b } = pair();
    must(reg.updateFields(a, { deadline: { at: '2026-10-20T00:00:00.000Z', kind: 'target', promised_to: null } }, DEV));
    must(reg.updateFields(b, { deadline: { at: '2026-10-10T00:00:00.000Z', kind: 'promise', promised_to: 'the founder' } }, DEV));
    expect(must(reg.mergeInto(b, a, DEV, 'same')).canonical.deadline).toMatchObject({ at: '2026-10-10T00:00:00.000Z', kind: 'promise' });
  });

  it('evidence on the duplicate is carried over', () => {
    const { reg, a, b } = pair();
    const ev = must(reg.addEvidence(b, { kind: 'message', ref: 'wa:1', summary: 'the founder message' }, DEV));
    const { canonical } = must(reg.mergeInto(b, a, DEV, 'same'));
    expect(canonical.evidence.map((e) => e.id)).toContain(ev.id);
  });

  it('dependencies on the duplicate become dependencies on the canonical item', () => {
    const { reg, a, b } = pair();
    const blocker = newItem(reg);
    must(reg.addDependency(blocker.id, b, DEV));
    must(reg.mergeInto(b, a, DEV, 'same'));
    expect(reg.openBlockersOf(a)).toEqual([blocker.id]);
  });

  it('a merged duplicate can never be reopened or worked on', () => {
    const { reg, a, b } = pair();
    must(reg.mergeInto(b, a, DEV, 'same'));
    expect(code(reg.transition(b, 'reopened', VIRAT, { reason: 'oops' }))).toBe('merged_duplicate');
    expect(code(reg.updateFields(b, { title: 'x' }, DEV))).toBe('merged_duplicate');
    expect(code(reg.mergeInto(b, a, DEV, 'again'))).toBe('merged_duplicate');
  });

  it('refuses: itself, a cycle, a closed canonical item, no reason, wrong levels, open children', () => {
    const { reg, a, b } = pair();
    expect(code(reg.mergeInto(a, a, DEV, 'x'))).toBe('merge_invalid');
    expect(code(reg.mergeInto(b, a, DEV, ' '))).toBe('merge_invalid');
    must(reg.mergeInto(b, a, DEV, 'same'));
    expect(code(reg.mergeInto(a, b, DEV, 'cycle'))).toBe('merge_invalid'); // b is already merged into a
    const closed = reach(reg, 'closed');
    const open = newItem(reg);
    expect(code(reg.mergeInto(open.id, closed, DEV, 'x'))).toBe('merge_invalid');
    const sub = must(reg.createItem({ level: 'subtask', parent_id: open.id, type: 'task', title: 's', scope: Scopes.brand('sample') }, DEV));
    expect(code(reg.mergeInto(open.id, a, DEV, 'x'))).toBe('merge_invalid'); // open child
    void sub;
    const obj = must(reg.createItem({ level: 'objective', type: 'task', title: 'o', scope: Scopes.devshop() }, DEV));
    const obj2 = must(reg.createItem({ level: 'objective', type: 'task', title: 'o2', scope: Scopes.devshop() }, DEV));
    expect(code(reg.mergeInto(obj.id, obj2.id, DEV, 'x'))).toBe('merge_invalid');
    expect(code(reg.mergeInto('missing', a, DEV, 'x'))).toBe('not_found');
  });

  it('reports from different brands merge only into a platform item', () => {
    const { reg } = makeRegistry();
    const sample = must(reg.ingestSourceEvent({ channel: 'whatsapp', external_ref: 's1', reporter: FOUNDER, brand: 'sample', title: 'Checkout page error', summary: 'e' })).item.id;
    const other = must(reg.ingestSourceEvent({ channel: 'whatsapp', external_ref: 'o1', reporter: OTHER_FOUNDER, brand: 'other', title: 'Checkout page error', summary: 'e' })).item.id;
    expect(code(reg.mergeInto(other, sample, DEV, 'same bug'))).toBe('merge_invalid');
    const platform = must(reg.createItem({ type: 'incident', title: 'Checkout page error (platform)', scope: Scopes.retailOs('storefront') }, DEV)).id;
    expect(must(reg.mergeInto(sample, platform, DEV, 'platform bug')).canonical.id).toBe(platform);
    expect(must(reg.mergeInto(other, platform, DEV, 'platform bug')).canonical.source_event_ids.length).toBe(2);
  });

  it('ruling two items NOT duplicates removes the suggestion and keeps both', () => {
    const { reg, a, b } = pair();
    expect(reg.possibleDuplicatesOf(b).length).toBe(1);
    must(reg.markNotDuplicate(b, a, DEV, 'one is about shoes, one about caps'));
    expect(reg.possibleDuplicatesOf(b)).toEqual([]);
    expect(reg.list({ openOnly: true }).length).toBe(2);
    expect(code(reg.markNotDuplicate(a, a, DEV, 'x'))).toBe('invalid_input');
    expect(code(reg.markNotDuplicate(a, b, DEV, ''))).toBe('invalid_input');
  });
});
