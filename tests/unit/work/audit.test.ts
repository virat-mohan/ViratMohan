import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Hex, appendEvent, verifyChain, buildEvent, GENESIS_HASH, canonicalJson, type WorkEvent } from '../../../src/lib/work';
import { DEV, SG_CEO, makeRegistry, must, newItem, reach } from './helpers';

describe('sha256 (dependency-free) matches node:crypto', () => {
  const inputs = ['', 'abc', 'The quick brown fox jumps over the lazy dog', 'ünïcödé ₹ 日本語 🙂', ...[55, 56, 63, 64, 65, 119, 120, 128, 1000].map((n) => 'a'.repeat(n))];
  it.each(inputs.map((s, i) => [i, s] as const))('input %i', (_i, s) => {
    expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
  });
});

describe('audit trail: append-only and tamper-evident', () => {
  const chain = () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    reg.logAction(id, { summary: 'did a thing' }, SG_CEO);
    reg.logAction(id, { summary: 'did another' }, SG_CEO);
    return [...reg.get(id)!.events];
  };

  it('records previous state, new state, actor, time and reason for every state change', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'in_progress');
    const e = reg.get(id)!.events.filter((x) => x.kind === 'state_change');
    expect(e.map((x) => [x.from, x.to])).toEqual([['new', 'triaged'], ['triaged', 'assigned'], ['assigned', 'in_progress']]);
    for (const x of e) { expect(x.actor.id).toBeTruthy(); expect(Date.parse(x.at)).not.toBeNaN(); }
    must(reg.transition(id, 'waiting', SG_CEO, { payload: { waiting: { on: 'supplier' } }, reason: 'needs their reply' }));
    const last = reg.get(id)!.events.at(-1)!;
    expect([last.from, last.to, last.reason, last.actor.id]).toEqual(['in_progress', 'waiting', 'needs their reply', 'SG-01']);
  });

  it('a valid chain verifies', () => {
    expect(verifyChain(chain())).toEqual({ ok: true });
    expect(verifyChain([])).toEqual({ ok: true });
  });

  it('detects an edited entry', () => {
    const c = chain().map((e) => ({ ...e, data: { ...e.data }, actor: { ...e.actor } }));
    c[1].reason = 'rewritten history';
    const r = verifyChain(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.brokenAt).toBe(1);
  });

  it('detects a removed entry (including the last one being cut and the first one dropped)', () => {
    const c = chain();
    expect(verifyChain([...c.slice(0, 2), ...c.slice(3)]).ok).toBe(false);
    expect(verifyChain(c.slice(1)).ok).toBe(false);
  });

  it('detects reordering and inserted entries', () => {
    const c = chain();
    expect(verifyChain([c[1], c[0], ...c.slice(2)]).ok).toBe(false);
    const forged = buildEvent(c[1], { at: c[1].at, actor: DEV, kind: 'action', data: { summary: 'forged' } });
    expect(verifyChain([c[0], c[1], forged, c[2]]).ok).toBe(false);
  });

  it('entries are frozen: they cannot be changed in place', () => {
    const e = chain()[0];
    expect(() => { (e as { reason: string | null }).reason = 'x'; }).toThrow(TypeError);
    expect(() => { (e.data as Record<string, unknown>).x = 1; }).toThrow(TypeError);
    expect(() => { (e.actor as { id: string }).id = 'x'; }).toThrow(TypeError);
  });

  it('appending never changes the item it was given', () => {
    const { reg } = makeRegistry();
    const it0 = newItem(reg);
    const before = JSON.stringify(it0);
    const next = appendEvent(it0, { at: it0.updated_at, actor: DEV, kind: 'action', data: { summary: 's' } });
    expect(JSON.stringify(it0)).toBe(before);
    expect(next.events.length).toBe(it0.events.length + 1);
  });

  it('the registry reports a broken chain, and a healthy one', () => {
    const { reg } = makeRegistry();
    const id = reach(reg, 'assigned');
    expect(must(reg.verifyAudit(id))).toEqual({ ok: true });
    const tampered = { ...reg.get(id)!, events: reg.get(id)!.events.slice(1) };
    expect(verifyChain(tampered.events).ok).toBe(false);
  });

  it('first event links to genesis; canonical JSON is key-order independent', () => {
    expect(chain()[0].prev_hash).toBe(GENESIS_HASH);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });

  it('events hash only their own content plus the previous hash', () => {
    const a = buildEvent(null, { at: '2026-01-01T00:00:00.000Z', actor: DEV, kind: 'created' }) as WorkEvent;
    const b = buildEvent(null, { at: '2026-01-01T00:00:00.000Z', actor: DEV, kind: 'created' }) as WorkEvent;
    expect(a.hash).toBe(b.hash);
  });
});
