// The live concurrency checks, run against the real schema (0055 + 0056) in embedded Postgres before they are ever
// pointed at the control plane. One connection means the "simultaneous" writers are interleaved, not truly parallel:
// this proves the checks and the cleanup are correct, not that the live database serialises them. That is the live run's job.
import { describe, expect, it } from 'vitest';
import { createSupabaseWorkStore } from '../../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry } from '../../../src/lib/work/db-registry';
import { Scopes } from '../../../src/lib/work/scope';
import { runConcurrencyVerification } from '../../../scripts/verify/live-concurrency-run';
import { closeTestRecord, closeLeftoverTestRecords } from '../../../scripts/verify/ceo-live-run';
import { DEV } from './helpers';
import { freshDb, pgClient } from './pg-client';

async function setup() {
  const db = await freshDb();
  const count = async (table: string, column: string, like: string) =>
    Number((await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${column} like $1`, [like])).rows[0].n);
  return { db, storeA: createSupabaseWorkStore(pgClient(db) as never), storeB: createSupabaseWorkStore(pgClient(db) as never), count };
}

describe('live concurrency script logic', () => {
  it('every check passes and every record it created is closed, not deleted', async () => {
    const { db, storeA, storeB, count } = await setup();
    const report = await runConcurrencyVerification(storeA, storeB, count, 'tst1');
    expect(report.checks.filter((c) => !c.ok).map((c) => `${c.name} [${c.detail}]`)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(15);
    const reg = await loadRegistry(storeA);
    const mine = reg.list().filter((i) => i.title.includes(' tst1'));
    expect(mine.length).toBeGreaterThanOrEqual(5);
    expect(mine.every((i) => i.state === 'closed' && i.title.startsWith('[IT-LIVE]'))).toBe(true);
    expect(Number((await db.query<{ n: number }>('select count(*)::int as n from repo_locks where released_at is null')).rows[0].n)).toBe(0);
  });

  it('a failed check is reported, never hidden: a store that loses every write fails the run', async () => {
    const { storeA, count } = await setup();
    const broken = { loadAll: () => storeA.loadAll(), persist: async () => { throw new Error('boom'); } };
    const report = await runConcurrencyVerification(broken as never, broken as never, count, 'tst2');
    expect(report.ok).toBe(false);
  });
});

describe('closing a test record that never left NEW', () => {
  it('triages and assigns it to the CEO agent, then closes it through the lifecycle with its history kept', async () => {
    const { storeA } = await setup();
    const id = await mutateRegistry(storeA, (reg) => {
      const r = reg.createItem({ title: '[IT-LIVE] stuck in new', type: 'task', scope: Scopes.devshop() }, DEV);
      if (!r.ok) throw new Error('create');
      return { value: r.value.id, changed: true };
    });
    expect((await loadRegistry(storeA)).get(id)!.state).toBe('new');
    const r = await closeTestRecord(storeA, id, 'test');
    expect(r.ok).toBe(true);
    const reg = await loadRegistry(storeA);
    expect(reg.get(id)!.state).toBe('closed');
    expect(reg.get(id)!.events.length).toBeGreaterThan(3);
    expect(reg.verifyAudit(id).ok).toBe(true);
  });

  it('refuses anything that is not a test record', async () => {
    const { storeA } = await setup();
    const id = await mutateRegistry(storeA, (reg) => {
      const r = reg.createItem({ title: 'Real customer work', type: 'task', scope: Scopes.devshop() }, DEV);
      if (!r.ok) throw new Error('create');
      return { value: r.value.id, changed: true };
    });
    const r = await closeTestRecord(storeA, id, 'test');
    expect(r.ok).toBe(false);
    expect((await loadRegistry(storeA)).get(id)!.state).toBe('new');
  });

  it('closeLeftoverTestRecords closes a leftover stuck in NEW and leaves other Work alone', async () => {
    const { storeA } = await setup();
    const ids = await mutateRegistry(storeA, (reg) => {
      const a = reg.createItem({ title: '[IT-LIVE] leftover', type: 'task', scope: Scopes.devshop() }, DEV);
      const b = reg.createItem({ title: 'Real work', type: 'task', scope: Scopes.devshop() }, DEV);
      if (!a.ok || !b.ok) throw new Error('create');
      return { value: [a.value.id, b.value.id], changed: true };
    });
    const c = await closeLeftoverTestRecords(storeA);
    expect(c.failed).toEqual([]);
    expect(c.closed).toHaveLength(1);
    const reg = await loadRegistry(storeA);
    expect(reg.get(ids[0])!.state).toBe('closed');
    expect(reg.get(ids[1])!.state).toBe('new');
  });
});
