// Two writers against the real schema (migration 0055 in embedded Postgres) through the real store.
import { describe, expect, it } from 'vitest';
import { createSupabaseWorkStore } from '../../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry, persistBaseline, MAX_WRITE_ATTEMPTS } from '../../../src/lib/work/db-registry';
import { WorkConflictError, type WorkStore } from '../../../src/lib/work/db-store';
import { Scopes } from '../../../src/lib/work/scope';
import { DEV } from './helpers';
import { freshDb, pgClient } from './pg-client';

const baseOf = (reg: { snapshot(): { items: { id: string; events: unknown[] }[] } }) => new Map(reg.snapshot().items.map((i) => [i.id, i.events.length]));

async function setup() {
  const db = await freshDb();
  const store = createSupabaseWorkStore(pgClient(db) as never);
  const seed = await loadRegistry(store);
  const a = seed.createItem({ title: 'Item X', type: 'task', scope: Scopes.devshop() }, DEV);
  const b = seed.createItem({ title: 'Item Y', type: 'task', scope: Scopes.devshop() }, DEV);
  if (!a.ok || !b.ok) throw new Error('seed');
  await store.persist(seed.snapshot());
  return { db, store, x: a.value.id, y: b.value.id };
}

describe('two writers, real schema', () => {
  it('a stale writer is refused instead of silently losing its event and overwriting the item', async () => {
    const { store, x } = await setup();
    const A = await loadRegistry(store); const baseA = baseOf(A);
    const B = await loadRegistry(store); const baseB = baseOf(B);
    expect(A.addEvidence(x, { kind: 'note', ref: 'a', summary: 'from A' }, DEV).ok).toBe(true);
    expect(B.addEvidence(x, { kind: 'note', ref: 'b', summary: 'from B' }, DEV).ok).toBe(true);
    await store.persist(A.snapshot(), { base: baseA });
    await expect(store.persist(B.snapshot(), { base: baseB })).rejects.toThrow(/conflict/i);

    const after = await loadRegistry(store);
    const item = after.get(x)!;
    expect(item.evidence.map((e) => e.ref)).toEqual(['a']);
    expect(after.verifyAudit(x).ok).toBe(true);
  });

  it('a writer does not overwrite items it did not change', async () => {
    const { store, x, y } = await setup();
    const A = await loadRegistry(store); const baseA = baseOf(A);
    const B = await loadRegistry(store); const baseB = baseOf(B);
    A.addEvidence(x, { kind: 'note', ref: 'a', summary: 'A changes X' }, DEV);
    B.addEvidence(y, { kind: 'note', ref: 'b', summary: 'B changes Y' }, DEV);
    await store.persist(A.snapshot(), { base: baseA });
    await store.persist(B.snapshot(), { base: baseB });

    const after = await loadRegistry(store);
    expect(after.get(x)!.evidence.map((e) => e.ref)).toEqual(['a']);
    expect(after.get(y)!.evidence.map((e) => e.ref)).toEqual(['b']);
    expect(after.verifyAudit(x).ok && after.verifyAudit(y).ok).toBe(true);
  });
});

describe('mutateRegistry: bounded retry on conflict', () => {
  // wraps the real store: before the writer's persist, an interfering writer lands a change on the same item
  const interfering = (store: WorkStore, x: string, times: number): WorkStore => {
    let left = times;
    return {
      loadAll: () => store.loadAll(),
      async persist(snap, opts) {
        if (left-- > 0) {
          const other = await loadRegistry(store); const b = baseOf(other);
          other.addEvidence(x, { kind: 'note', ref: `other-${left}`, summary: 'interfering writer' }, DEV);
          await store.persist(other.snapshot(), { base: b });
        }
        return store.persist(snap, opts);
      },
    };
  };

  it('re-runs on fresh state and both changes land', async () => {
    const { store, x } = await setup();
    let runs = 0;
    await mutateRegistry(interfering(store, x, 1), (reg) => {
      runs++;
      reg.addEvidence(x, { kind: 'note', ref: 'mine', summary: 'my change' }, DEV);
      return { value: null, changed: true };
    });
    expect(runs).toBe(2);
    const after = await loadRegistry(store);
    expect(after.get(x)!.evidence.map((e) => e.ref).sort()).toEqual(['mine', 'other-0']);
    expect(after.verifyAudit(x).ok).toBe(true);
  });

  it('gives up after the bounded attempts and writes nothing of the stale change', async () => {
    const { store, x } = await setup();
    let runs = 0;
    await expect(mutateRegistry(interfering(store, x, 99), (reg) => {
      runs++;
      reg.addEvidence(x, { kind: 'note', ref: 'mine', summary: 'my change' }, DEV);
      return { value: null, changed: true };
    })).rejects.toBeInstanceOf(WorkConflictError);
    expect(runs).toBe(MAX_WRITE_ATTEMPTS);
    const after = await loadRegistry(store);
    expect(after.get(x)!.evidence.some((e) => e.ref === 'mine')).toBe(false);
  });

  it('a read-only operation writes nothing', async () => {
    const { store } = await setup();
    let persists = 0;
    const counting: WorkStore = { loadAll: () => store.loadAll(), persist: async (s, o) => { persists++; return store.persist(s, o); } };
    await mutateRegistry(counting, () => ({ value: 1, changed: false }));
    expect(persists).toBe(0);
  });

  it('two writers creating different items both land', async () => {
    const { store } = await setup();
    const A = await loadRegistry(store); const baseA = baseOf(A);
    const B = await loadRegistry(store); const baseB = baseOf(B);
    A.createItem({ title: 'From A', type: 'task', scope: Scopes.devshop() }, DEV);
    B.createItem({ title: 'From B', type: 'task', scope: Scopes.devshop() }, DEV);
    await store.persist(A.snapshot(), { base: baseA });
    await store.persist(B.snapshot(), { base: baseB });
    const after = await loadRegistry(store);
    expect(after.list().map((i) => i.title).sort()).toEqual(['From A', 'From B', 'Item X', 'Item Y']);
  });
});

// ── the other shared collections: source events, links, repo locks ──────────────────────────────────────────

const SCOPE = { repository: 'repo-a', branch: 'main', worktree: null, paths: [], deployment_target: null, material: true };
const SCOPE_OTHER_ITEM_SAME_BRANCH = { ...SCOPE };
type Reg = Awaited<ReturnType<typeof loadRegistry>>;

function owned(reg: Reg, title: string): string {
  const r = reg.createItem({ title, type: 'task', scope: Scopes.devshop() }, DEV);
  if (!r.ok) throw new Error('create');
  const id = r.value.id;
  reg.transition(id, 'triaged', DEV, { payload: { triage: { type: 'task', priority: 'P3', priority_reason: 'test', scope: Scopes.devshop() } } });
  reg.transition(id, 'assigned', DEV, { payload: { owner: DEV } });
  return id;
}
const count = async (db: Awaited<ReturnType<typeof freshDb>>, table: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n);
const intact = async (store: WorkStore) => { const r = await loadRegistry(store); return r.list().every((i) => r.verifyAudit(i.id).ok); };

describe('shared collections: source events', () => {
  const report = { channel: 'system_alert' as const, external_ref: 'alert-1', reporter: { kind: 'system' as const, id: 'system:health' }, title: 'Checkout health check failing', summary: 'x' };

  it('the same report ingested twice is one item and one source event', async () => {
    const { db, store } = await setup();
    await mutateRegistry(store, (r) => ({ value: r.ingestSourceEvent(report), changed: true }));
    const second = await mutateRegistry(store, (r) => { const o = r.ingestSourceEvent(report); return { value: o, changed: o.ok && o.value.outcome !== 'duplicate_event' }; });
    expect(second.ok && second.value.outcome).toBe('duplicate_event');
    expect(await count(db, 'work_source_events')).toBe(1);
    expect(await count(db, 'work_items')).toBe(3);
  });

  it('two writers ingesting the same report at once: the second is refused before it writes an item, and on retry it dedupes', async () => {
    const { db, store } = await setup();
    const A = await loadRegistry(store); const optA = persistBaseline(A);
    const B = await loadRegistry(store); const optB = persistBaseline(B);
    A.ingestSourceEvent(report); B.ingestSourceEvent(report);
    await store.persist(A.snapshot(), optA);
    await expect(store.persist(B.snapshot(), optB)).rejects.toBeInstanceOf(WorkConflictError);
    expect(await count(db, 'work_items')).toBe(3);
    expect(await count(db, 'work_source_events')).toBe(1);

    // through mutateRegistry the loser retries on fresh state and finds the duplicate
    const retried = await mutateRegistry(store, (r) => { const o = r.ingestSourceEvent(report); return { value: o, changed: o.ok && o.value.outcome !== 'duplicate_event' }; });
    expect(retried.ok && retried.value.outcome).toBe('duplicate_event');
    expect(await count(db, 'work_items')).toBe(3);
    expect(await intact(store)).toBe(true);
  });
});

describe('shared collections: repo locks', () => {
  async function withLock() {
    const t = await setup();
    const seed = await loadRegistry(t.store);
    const x = owned(seed, 'Lock holder'); const z = owned(seed, 'Bystander');
    const l = seed.acquireLock(x, SCOPE as never, DEV);
    if (!l.ok) throw new Error('lock');
    await t.store.persist(seed.snapshot());
    return { ...t, x, z, lockId: l.value.id };
  }

  it('a writer that did not touch a lock cannot resurrect it after another writer released it', async () => {
    const { db, store, z, lockId } = await withLock();
    const A = await loadRegistry(store); const optA = persistBaseline(A);
    const B = await loadRegistry(store); const optB = persistBaseline(B);
    expect(A.releaseLock(lockId, DEV, 'done').ok).toBe(true);
    B.addEvidence(z, { kind: 'note', ref: 'b', summary: 'B touches the bystander' }, DEV);
    await store.persist(A.snapshot(), optA);
    await store.persist(B.snapshot(), optB);
    const row = (await db.query<{ released_at: string | null; released_reason: string | null }>('select released_at, released_reason from repo_locks')).rows[0];
    expect(row.released_at).not.toBeNull();
    expect(row.released_reason).toBe('done');
    expect(await intact(store)).toBe(true);
  });

  it('two writers taking the same branch on different items: exactly one lock, the loser writes nothing and then sees the conflict', async () => {
    const t = await setup();
    const seed = await loadRegistry(t.store);
    const p = owned(seed, 'Item P'); const q = owned(seed, 'Item Q');
    await t.store.persist(seed.snapshot());
    const A = await loadRegistry(t.store); const optA = persistBaseline(A);
    const B = await loadRegistry(t.store); const optB = persistBaseline(B);
    expect(A.acquireLock(p, SCOPE as never, DEV).ok).toBe(true);
    expect(B.acquireLock(q, SCOPE_OTHER_ITEM_SAME_BRANCH as never, DEV).ok).toBe(true);
    await t.store.persist(A.snapshot(), optA);
    await expect(t.store.persist(B.snapshot(), optB)).rejects.toBeInstanceOf(WorkConflictError);
    expect(await count(t.db, 'repo_locks')).toBe(1);
    expect((await loadRegistry(t.store)).get(q)!.events.some((e) => e.kind === 'lock_acquired')).toBe(false);

    const again = await mutateRegistry(t.store, (r) => { const res = r.acquireLock(q, SCOPE_OTHER_ITEM_SAME_BRANCH as never, DEV); return { value: res, changed: res.ok }; });
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error.code).toBe('repo_conflict');
    expect(await count(t.db, 'repo_locks')).toBe(1);
    expect(await intact(t.store)).toBe(true);
  });

  it('two writers renewing and releasing the same lock: the stale one is refused', async () => {
    const { store, lockId, x } = await withLock();
    const A = await loadRegistry(store); const optA = persistBaseline(A);
    const B = await loadRegistry(store); const optB = persistBaseline(B);
    expect(A.renewLock(lockId, DEV).ok).toBe(true);
    expect(B.releaseLock(lockId, DEV, 'done').ok).toBe(true);
    await store.persist(A.snapshot(), optA);
    await expect(store.persist(B.snapshot(), optB)).rejects.toBeInstanceOf(WorkConflictError);
    const after = await loadRegistry(store);
    expect(after.get(x)!.events.some((e) => e.kind === 'lock_released')).toBe(false);
    expect(after.activeLocks().length).toBe(1);
  });
});

describe('shared collections: links', () => {
  it('two writers adding the same dependency: one link, the loser is refused and then sees it exists', async () => {
    const t = await setup();
    const A = await loadRegistry(t.store); const optA = persistBaseline(A);
    const B = await loadRegistry(t.store); const optB = persistBaseline(B);
    expect(A.addDependency(t.x, t.y, DEV).ok).toBe(true);
    expect(B.addDependency(t.x, t.y, DEV).ok).toBe(true);
    await t.store.persist(A.snapshot(), optA);
    await expect(t.store.persist(B.snapshot(), optB)).rejects.toBeInstanceOf(WorkConflictError);
    expect(await count(t.db, 'work_links')).toBe(1);

    const again = await mutateRegistry(t.store, (r) => { const res = r.addDependency(t.x, t.y, DEV); return { value: res, changed: res.ok }; });
    expect(again.ok).toBe(false);
    expect(await count(t.db, 'work_links')).toBe(1);
    expect(await intact(t.store)).toBe(true);
  });

  it('an unrelated writer does not rewrite existing links', async () => {
    const t = await setup();
    const seed = await loadRegistry(t.store);
    const w = owned(seed, 'Third item');
    seed.addDependency(t.x, t.y, DEV);
    await t.store.persist(seed.snapshot());
    const before = (await t.db.query<{ id: string; at: string }>('select id, at from work_links')).rows[0];
    await mutateRegistry(t.store, (r) => { r.addEvidence(w, { kind: 'note', ref: 'n', summary: 'unrelated' }, DEV); return { value: null, changed: true }; });
    const after = (await t.db.query<{ id: string; at: string }>('select id, at from work_links')).rows[0];
    expect(after).toEqual(before);
  });
});
