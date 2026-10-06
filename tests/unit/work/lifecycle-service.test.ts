// The later lifecycle through the server-side service, against the real schema (0055 + 0056) in embedded Postgres.
import { describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createSupabaseWorkStore, type WorkStore } from '../../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry, persistBaseline } from '../../../src/lib/work/db-registry';
import { advanceWork, isTestRecord } from '../../../src/lib/work/lifecycle-service';
import { Scopes } from '../../../src/lib/work/scope';
import { VIRAT, PRINCE } from '../../../src/lib/work/actors';
import { DEV } from './helpers';
import { freshDb, pgClient } from './pg-client';

type Reg = Awaited<ReturnType<typeof loadRegistry>>;

async function setup() {
  const db = await freshDb();
  const store = createSupabaseWorkStore(pgClient(db) as never);
  return { db, store };
}
async function seedItem(store: WorkStore, title: string, over: { priority?: 'P0' | 'P3'; type?: 'task' | 'incident' } = {}): Promise<string> {
  let id = '';
  await mutateRegistry(store, (reg: Reg) => {
    const c = reg.createItem({ title, type: over.type ?? 'task', scope: Scopes.devshop() }, DEV);
    if (!c.ok) throw new Error('seed');
    id = c.value.id;
    reg.transition(id, 'triaged', DEV, { payload: { triage: { type: over.type ?? 'task', priority: over.priority ?? 'P3', priority_reason: 'test', scope: Scopes.devshop() } } });
    reg.transition(id, 'assigned', DEV, { payload: { owner: DEV } });
    return { value: null, changed: true };
  });
  return id;
}
const get = async (store: WorkStore, id: string) => (await loadRegistry(store)).get(id)!;
const events = async (db: PGlite) => Number((await db.query<{ n: number }>('select count(*)::int as n from work_events')).rows[0].n);
const EVIDENCE = [{ kind: 'note' as const, ref: 'check-1', summary: 'Checked by the Founder' }];

describe('resolve, verify, close: RESOLVED is not CLOSED', () => {
  it('walks start, resolve, verify, close; each step persists; history only grows', async () => {
    const { store } = await setup();
    const id = await seedItem(store, 'Real work');
    const trail: string[] = [];
    const before = (await get(store, id)).events.map((e) => e.hash);

    for (const [action, extra] of [
      ['start', {}], ['resolve', { summary: 'Done and checked' }], ['verify', {}], ['close', { method: 'Reviewed the result', evidence: EVIDENCE }],
    ] as const) {
      const r = await advanceWork(store, { work: id, action, by: VIRAT, ...extra });
      expect(r.ok, `${action}: ${r.ok ? '' : r.error.message}`).toBe(true);
      trail.push((await get(store, id)).state);
    }
    expect(trail).toEqual(['in_progress', 'resolved', 'verification', 'closed']);

    const item = await get(store, id);
    expect(item.events.slice(0, before.length).map((e) => e.hash)).toEqual(before);
    expect(item.events.length).toBeGreaterThan(before.length);
    expect(item.closure).toMatchObject({ verified_by: { id: 'DS-00' }, method: 'Reviewed the result' });
    expect(item.closure!.evidence_ids.length).toBe(1);
    expect(item.closed_at).not.toBeNull();
    expect((await loadRegistry(store)).verifyAudit(id).ok).toBe(true);
  });

  it('RESOLVED cannot go straight to CLOSED, and a refused move writes nothing', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, 'Real work');
    await advanceWork(store, { work: id, action: 'start', by: VIRAT });
    await advanceWork(store, { work: id, action: 'resolve', by: VIRAT, summary: 'Done' });
    const n = await events(db);
    const r = await advanceWork(store, { work: id, action: 'close', by: VIRAT, method: 'x', evidence: EVIDENCE });
    expect(!r.ok && r.error.code).toBe('illegal_transition');
    expect(await events(db)).toBe(n);
    expect((await get(store, id)).state).toBe('resolved');
  });

  it('closing needs a method and evidence', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, 'Real work');
    for (const a of ['start', 'resolve', 'verify'] as const) await advanceWork(store, { work: id, action: a, by: VIRAT, summary: 'ok' });
    const n = await events(db);
    const r = await advanceWork(store, { work: id, action: 'close', by: VIRAT });
    expect(!r.ok && r.error.code).toBe('verification_required');
    expect(await events(db)).toBe(n);
    expect((await get(store, id)).state).toBe('verification');
  });

  it('other illegal moves fail safely: resolve before start, start twice, verify before resolve', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, 'Real work');
    const n = await events(db);
    expect((await advanceWork(store, { work: id, action: 'resolve', by: VIRAT, summary: 'x' })).ok).toBe(false);
    expect((await advanceWork(store, { work: id, action: 'verify', by: VIRAT })).ok).toBe(false);
    await advanceWork(store, { work: id, action: 'start', by: VIRAT });
    expect((await advanceWork(store, { work: id, action: 'start', by: VIRAT })).ok).toBe(false);
    expect(await events(db)).toBe(n + 1);
  });

  it('only the Founder uses this service; anyone else is refused with no write', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, 'Real work');
    const n = await events(db);
    for (const by of [DEV, PRINCE]) {
      const r = await advanceWork(store, { work: id, action: 'start', by });
      expect(!r.ok && r.error.code).toBe('not_permitted');
    }
    expect(await events(db)).toBe(n);
  });

  it('a P0 item cannot be verified by whoever resolved it, and the whole attempt writes nothing', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, 'Outage', { priority: 'P0' });
    await advanceWork(store, { work: id, action: 'start', by: VIRAT });
    await advanceWork(store, { work: id, action: 'resolve', by: VIRAT, summary: 'fixed' });
    await advanceWork(store, { work: id, action: 'verify', by: VIRAT });
    const n = await events(db);
    const r = await advanceWork(store, { work: id, action: 'close', by: VIRAT, method: 'self check', evidence: EVIDENCE });
    expect(!r.ok && r.error.code).toBe('verifier_must_differ');
    expect(await events(db)).toBe(n);
  });

  it('a closed item can be reopened with a reason; nothing is lost', async () => {
    const { store } = await setup();
    const id = await seedItem(store, 'Real work');
    for (const [a, x] of [['start', {}], ['resolve', { summary: 'done' }], ['verify', {}], ['close', { method: 'm', evidence: EVIDENCE }]] as const) await advanceWork(store, { work: id, action: a, by: VIRAT, ...x });
    const closedEvents = (await get(store, id)).events.length;
    await mutateRegistry(store, (reg) => { const r = reg.transition(id, 'reopened', VIRAT, { reason: 'found a regression' }); return { value: r, changed: r.ok }; });
    const item = await get(store, id);
    expect(item.state).toBe('reopened');
    expect(item.events.length).toBe(closedEvents + 1);
    expect(item.events.some((e) => e.to === 'closed')).toBe(true);
  });
});

describe('closing a test record without deleting it', () => {
  it('closes an [IT-LIVE] record in one atomic write, keeps the marker and the whole history, and touches nothing else', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, '[IT-LIVE] Verify the CEO runtime write path 2026-10-06');
    const other = await seedItem(store, 'Unrelated real work');
    const otherBefore = await get(store, other);
    const n = await events(db);

    const r = await advanceWork(store, { work: id, action: 'close_test_record', by: VIRAT });
    expect(r.ok).toBe(true);
    const item = await get(store, id);
    expect(item.state).toBe('closed');
    expect(item.title.startsWith('[IT-LIVE]')).toBe(true);
    expect(item.events.slice(-4).map((e) => e.to)).toEqual(['in_progress', 'resolved', 'verification', 'closed']);
    expect(item.resolution?.by.id).toBe('DS-02');
    expect(item.closure?.verified_by.id).toBe('DS-00');
    expect(await events(db)).toBe(n + 4);
    expect((await loadRegistry(store)).verifyAudit(id).ok).toBe(true);

    const otherAfter = await get(store, other);
    expect(otherAfter.state).toBe(otherBefore.state);
    expect(otherAfter.events.length).toBe(otherBefore.events.length);
  });

  it('works from resolved or verification too, and a second close is refused', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, '[IT-TEST] a record');
    await advanceWork(store, { work: id, action: 'start', by: VIRAT });
    await advanceWork(store, { work: id, action: 'resolve', by: VIRAT, summary: 'done' });
    expect((await advanceWork(store, { work: id, action: 'close_test_record', by: VIRAT })).ok).toBe(true);
    const n = await events(db);
    const again = await advanceWork(store, { work: id, action: 'close_test_record', by: VIRAT });
    expect(again.ok).toBe(false);
    expect(await events(db)).toBe(n);
  });

  it('refuses Work that is not marked as a test record', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, 'Real customer work');
    const n = await events(db);
    const r = await advanceWork(store, { work: id, action: 'close_test_record', by: VIRAT });
    expect(!r.ok && r.error.code).toBe('not_permitted');
    expect(isTestRecord('Real customer work')).toBe(false);
    expect(await events(db)).toBe(n);
    expect((await get(store, id)).state).toBe('assigned');
  });

  it('a composite close that fails part way leaves no partial state (all transitions roll back together)', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, '[IT-TEST] incident record', { type: 'incident' });
    const n = await events(db);
    const r = await advanceWork(store, { work: id, action: 'close_test_record', by: VIRAT });
    expect(r.ok).toBe(false);
    expect(await events(db)).toBe(n);
    const item = await get(store, id);
    expect(item.state).toBe('assigned');
    expect(item.resolution).toBeNull();
  });

  it('is addressed by reference as well as id', async () => {
    const { store } = await setup();
    const id = await seedItem(store, '[IT-LIVE] by reference');
    const ref = (await get(store, id)).ref;
    expect(ref).toMatch(/^W-\d{4}$/);
    expect((await advanceWork(store, { work: ref, action: 'close_test_record', by: VIRAT })).ok).toBe(true);
    const missing = await advanceWork(store, { work: 'W-9999', action: 'start', by: VIRAT });
    expect(!missing.ok && missing.error.code).toBe('not_found');
  });
});

describe('a human-owned test record is never attributed to the human', () => {
  it('the Founder performs the steps and the human owner is not recorded as resolving', async () => {
    const { store } = await setup();
    let id = '';
    await mutateRegistry(store, (reg) => {
      const c = reg.createItem({ title: '[IT-TEST] human owned', type: 'task', scope: Scopes.devshop() }, DEV);
      if (!c.ok) throw new Error('seed');
      id = c.value.id;
      reg.transition(id, 'triaged', DEV, { payload: { triage: { type: 'task', priority: 'P3', priority_reason: 't', scope: Scopes.devshop() } } });
      reg.transition(id, 'assigned', VIRAT, { payload: { owner: PRINCE } });
      return { value: null, changed: true };
    });
    const r = await advanceWork(store, { work: id, action: 'close_test_record', by: VIRAT });
    expect(r.ok).toBe(true);
    const item = await get(store, id);
    expect(item.resolution?.by.id).toBe('DS-00');
    expect(item.events.filter((e) => e.kind === 'state_change').slice(-4).every((e) => e.actor.id === 'DS-00')).toBe(true);
    expect(item.owner?.id).toBe('P-01');
  });
});

describe('the schema itself refuses what the lifecycle forbids', () => {
  it('no closing without a verified closure, no deleting Work, no changing history', async () => {
    const { store, db } = await setup();
    const id = await seedItem(store, 'Real work');
    await expect(db.query(`update work_items set state = 'closed', closed_at = now() where id = $1`, [id])).rejects.toThrow();
    await expect(db.query('delete from work_items where id = $1', [id])).rejects.toThrow(/never deleted|no_delete|closed, never/i);
    await expect(db.query('update work_events set reason = $1', ['tampered'])).rejects.toThrow(/append-only/);
    await expect(db.query('delete from work_events')).rejects.toThrow(/append-only/);
  });
});

describe('approvals persist atomically with their Work change', () => {
  async function pendingApproval(store: WorkStore) {
    let id = '';
    await mutateRegistry(store, (reg) => {
      const c = reg.createItem({ title: 'Needs approval', type: 'request', scope: Scopes.devshop() }, DEV);
      if (!c.ok) throw new Error('seed');
      id = c.value.id;
      reg.transition(id, 'triaged', DEV, { payload: { triage: { type: 'request', priority: 'P3', priority_reason: 't', scope: Scopes.devshop() } } });
      reg.transition(id, 'assigned', DEV, { payload: { owner: DEV } });
      const ev = reg.addEvidence(id, { kind: 'note', ref: 'e', summary: 'evidence' }, DEV);
      if (!ev.ok) throw new Error('ev');
      reg.requestApproval(id, { requested_from: 'virat', authority: 'prince_assignment', reason: 'assign', evidence_ids: [ev.value.id], recommendation: 'approve' }, DEV);
      return { value: null, changed: true };
    });
    return id;
  }

  it('the decision, the reassignment and their audit events land together', async () => {
    const { store } = await setup();
    const id = await pendingApproval(store);
    await mutateRegistry(store, (reg) => {
      reg.decideApproval(id, 'approved', VIRAT, 'approved');
      reg.reassign(id, PRINCE, VIRAT, 'approved assignment', { keepPreviousAsSupporting: true });
      return { value: null, changed: true };
    });
    const item = await get(store, id);
    expect(item.approval?.decision?.outcome).toBe('approved');
    expect(item.owner?.id).toBe('P-01');
    expect(item.events.slice(-3).map((e) => e.kind)).toEqual(['approval_decided', 'state_change', 'owner_assigned']);
    expect((await loadRegistry(store)).verifyAudit(id).ok).toBe(true);
  });

  it('a concurrent decision on the same approval is refused whole: one decision, no half-applied assignment', async () => {
    const { store } = await setup();
    const id = await pendingApproval(store);
    const A = await loadRegistry(store); const oA = persistBaseline(A);
    const B = await loadRegistry(store); const oB = persistBaseline(B);
    A.decideApproval(id, 'approved', VIRAT, 'A'); A.reassign(id, PRINCE, VIRAT, 'A assigns', { keepPreviousAsSupporting: true });
    B.decideApproval(id, 'rejected', VIRAT, 'B says no');
    await store.persist(A.snapshot(), oA);
    await expect(store.persist(B.snapshot(), oB)).rejects.toThrow(/changed since it was loaded/);
    const item = await get(store, id);
    expect(item.approval?.decision?.outcome).toBe('approved');
    expect(item.owner?.id).toBe('P-01');
  });
});
