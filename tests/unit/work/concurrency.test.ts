// Two writers against the real schema (migration 0055 in embedded Postgres) through the real store.
import { describe, expect, it } from 'vitest';
import { createSupabaseWorkStore } from '../../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry, MAX_WRITE_ATTEMPTS } from '../../../src/lib/work/db-registry';
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
