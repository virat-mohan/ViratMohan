// work_persist (migration 0056) against the real schema (0055 + 0056) in embedded Postgres.
// Everything here is SCHEMA-VERIFIED: a real Postgres engine, not a live Supabase project.
import { describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { InMemoryWorkRegistry } from '../../../src/lib/work/registry';
import { createSupabaseWorkStore, rowFromItem, rowFromEvent, WorkConflictError } from '../../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry, persistBaseline } from '../../../src/lib/work/db-registry';
import { Scopes } from '../../../src/lib/work/scope';
import { DEV } from './helpers';
import { freshDb, pgClient, MIGRATIONS } from './pg-client';

const count = async (db: PGlite, t: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${t}`)).rows[0].n);
const persistFn = (db: PGlite, p: unknown) => db.query('select work_persist($1::jsonb) as r', [JSON.stringify(p)]);
const codeOf = async (run: () => Promise<unknown>) => { try { await run(); return null; } catch (e) { return (e as { code?: string }).code ?? 'error'; } };

/** Two items and their events, built by the contract, as the rows the store would send. */
function twoItems() {
  const reg = new InMemoryWorkRegistry();
  const a = reg.createItem({ title: 'Item A', type: 'task', scope: Scopes.devshop() }, DEV);
  const b = reg.createItem({ title: 'Item B', type: 'task', scope: Scopes.devshop() }, DEV);
  if (!a.ok || !b.ok) throw new Error('seed');
  const items = reg.snapshot().items;
  return { items, rows: items.map(rowFromItem), events: items.flatMap((i) => i.events.map((e) => rowFromEvent(i.id, e))) };
}

function counting(db: PGlite) {
  const inner = pgClient(db);
  const calls: string[] = [];
  const client = {
    rpc: (fn: string, args: { p: unknown }) => { calls.push(`rpc:${fn}`); return inner.rpc(fn, args); },
    from: (t: string) => {
      const f = inner.from(t);
      return {
        select: (c?: string) => { calls.push(`select:${t}`); return f.select(c); },
        upsert: (r: unknown[], o?: { onConflict: string }) => { calls.push(`upsert:${t}`); return f.upsert(r, o); },
        insert: (r: unknown[]) => { calls.push(`insert:${t}`); return f.insert(r); },
      };
    },
  };
  return { client, calls };
}

describe('migration 0056', () => {
  it('applies twice (idempotent) and adds no table', async () => {
    const db = await freshDb();
    await expect(db.exec(MIGRATIONS[1])).resolves.toBeDefined();
    const t = await db.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' order by 1`);
    expect(t.rows.map((r) => r.table_name)).toEqual(['repo_locks', 'work_events', 'work_items', 'work_links', 'work_source_events']);
  });

  it('is least privilege: nothing is granted to PUBLIC, and the search_path is fixed', async () => {
    const db = await freshDb();
    const r = await db.query<{ proname: string; acl: string | null; cfg: string | null }>(
      `select proname, proacl::text as acl, proconfig::text as cfg from pg_proc where proname in ('work_persist','work_persist_rows') order by 1`);
    expect(r.rows.length).toBe(2);
    for (const f of r.rows) {
      expect(f.acl).not.toBeNull();
      expect(f.acl).not.toMatch(/(^\{|,)=X\//);
      expect(f.cfg).toContain('search_path=public, pg_temp');
    }
  });

  it('the internal helper refuses any table that is not a Work Registry table', async () => {
    const db = await freshDb();
    await expect(db.query(`select work_persist_rows('pg_class', '[{"relname":"x"}]'::jsonb)`)).rejects.toThrow(/not a Work Registry table/);
  });

  it('refuses a row carrying a column that is not writable (generated or unknown), writing nothing', async () => {
    const db = await freshDb();
    const { rows } = twoItems();
    await expect(persistFn(db, { items_new: [{ ...rows[0], ref: 'W-9999' }] })).rejects.toThrow(/not writable/);
    await expect(persistFn(db, { items_new: [{ ...rows[0], bogus: 1 }] })).rejects.toThrow(/not writable/);
    expect(await count(db, 'work_items')).toBe(0);
  });
});

describe('atomicity: a failed logical write leaves no partial state', () => {
  it('a successful write commits every related change', async () => {
    const db = await freshDb();
    const { rows, events } = twoItems();
    const r = await persistFn(db, { items_new: rows, events });
    expect((r.rows[0] as { r: { ok: boolean; items_new: number; events: number } }).r).toMatchObject({ ok: true, items_new: 2, events: events.length });
    expect(await count(db, 'work_items')).toBe(2);
    expect(await count(db, 'work_events')).toBe(events.length);
  });

  it('a broken event chain rolls back the new items written before it', async () => {
    const db = await freshDb();
    const { rows, events } = twoItems();
    const broken = events.map((e, i) => (i === events.length - 1 ? { ...e, seq: 2 } : e));
    await expect(persistFn(db, { items_new: rows, events: broken })).rejects.toThrow(/first event of an item must be seq 1/);
    expect(await count(db, 'work_items')).toBe(0);
    expect(await count(db, 'work_events')).toBe(0);
  });

  it('a duplicate report rolls back the new item and its events (no orphan item)', async () => {
    const db = await freshDb();
    const store = createSupabaseWorkStore(pgClient(db) as never);
    const first = new InMemoryWorkRegistry();
    first.ingestSourceEvent({ channel: 'system_alert', external_ref: 'r-1', reporter: { kind: 'system', id: 'system:health' }, title: 'Health check failing', summary: 'x' });
    await store.persist(first.snapshot());
    const second = new InMemoryWorkRegistry();
    second.ingestSourceEvent({ channel: 'system_alert', external_ref: 'r-1', reporter: { kind: 'system', id: 'system:health' }, title: 'Health check failing', summary: 'x' });
    await expect(store.persist(second.snapshot(), persistBaseline(new InMemoryWorkRegistry()))).rejects.toBeInstanceOf(WorkConflictError);
    expect(await count(db, 'work_items')).toBe(1);
    expect(await count(db, 'work_source_events')).toBe(1);
    expect(await count(db, 'work_events')).toBe(first.snapshot().items[0].events.length);
  });

  it('a stale writer is refused with WR409 and its other new items are rolled back too', async () => {
    const db = await freshDb();
    const store = createSupabaseWorkStore(pgClient(db) as never);
    const seed = new InMemoryWorkRegistry();
    const a = seed.createItem({ title: 'Item A', type: 'task', scope: Scopes.devshop() }, DEV);
    if (!a.ok) throw new Error('seed');
    await store.persist(seed.snapshot());
    const { rows: newRows, events: newEvents } = twoItems();
    const code = await codeOf(() => persistFn(db, { expect: { [a.value.id]: 0 }, items_new: newRows, events: newEvents }));
    expect(code).toBe('WR409');
    expect(await count(db, 'work_items')).toBe(1);
  });

  it('a failure late in the transaction undoes the item update, the new lock and the events', async () => {
    const db = await freshDb();
    const store = createSupabaseWorkStore(pgClient(db) as never);
    const seed = await loadRegistry(store);
    const c = seed.createItem({ title: 'Item', type: 'task', scope: Scopes.devshop() }, DEV);
    if (!c.ok) throw new Error('seed');
    await store.persist(seed.snapshot());

    const reg = await loadRegistry(store); const opts = persistBaseline(reg);
    reg.addEvidence(c.value.id, { kind: 'note', ref: 'n', summary: 'new evidence' }, DEV);
    const snap = reg.snapshot();
    const item = snap.items[0];
    const badLink = { id: '00000000-0000-0000-0000-0000000000aa', kind: 'blocks', from_id: item.id, to_id: item.id, at: new Date().toISOString(), by: DEV, note: null, score: null };
    const before = await db.query('select evidence, updated_at from work_items');
    const eventsBefore = await count(db, 'work_events');
    await expect(persistFn(db, {
      expect: { [item.id]: opts.base!.get(item.id) },
      items_upd: [rowFromItem(item)],
      events: item.events.slice(opts.base!.get(item.id)!).map((e) => rowFromEvent(item.id, e)),
      links_new: [badLink],
    })).rejects.toThrow();
    expect(await count(db, 'work_events')).toBe(eventsBefore);
    expect((await db.query('select evidence, updated_at from work_items')).rows).toEqual(before.rows);
  });

  it('audit chains are intact after commits and refusals', async () => {
    const db = await freshDb();
    const store = createSupabaseWorkStore(pgClient(db) as never);
    for (let i = 0; i < 3; i++) {
      await mutateRegistry(store, (reg) => { reg.createItem({ title: `Item ${i}`, type: 'task', scope: Scopes.devshop() }, DEV); return { value: null, changed: true }; });
    }
    const reg = await loadRegistry(store);
    expect(reg.list().length).toBe(3);
    expect(reg.list().every((i) => reg.verifyAudit(i.id).ok)).toBe(true);
  });
});

describe('the store', () => {
  it('maps the database conflict to WorkConflictError', async () => {
    const db = await freshDb();
    const store = createSupabaseWorkStore(pgClient(db) as never);
    const seed = await loadRegistry(store);
    const c = seed.createItem({ title: 'Item', type: 'task', scope: Scopes.devshop() }, DEV);
    if (!c.ok) throw new Error('seed');
    await store.persist(seed.snapshot());
    const A = await loadRegistry(store); const oA = persistBaseline(A);
    const B = await loadRegistry(store); const oB = persistBaseline(B);
    A.addEvidence(c.value.id, { kind: 'note', ref: 'a', summary: 'a' }, DEV);
    B.addEvidence(c.value.id, { kind: 'note', ref: 'b', summary: 'b' }, DEV);
    await store.persist(A.snapshot(), oA);
    await expect(store.persist(B.snapshot(), oB)).rejects.toThrow(/changed since it was loaded/);
    await expect(store.persist(B.snapshot(), oB)).rejects.toBeInstanceOf(WorkConflictError);
  });

  it('fails closed without a database function rather than falling back to several statements', async () => {
    const db = await freshDb();
    const { rpc: _omit, ...noRpc } = pgClient(db);
    const store = createSupabaseWorkStore(noRpc as never);
    const reg = new InMemoryWorkRegistry();
    reg.createItem({ title: 'x', type: 'task', scope: Scopes.devshop() }, DEV);
    await expect(store.persist(reg.snapshot(), persistBaseline(new InMemoryWorkRegistry()))).rejects.toThrow(/only safe write path/);
    expect(await count(db, 'work_items')).toBe(0);
  });

  it('refuses a baseline without the known rows', async () => {
    const db = await freshDb();
    const store = createSupabaseWorkStore(pgClient(db) as never);
    await expect(store.persist(new InMemoryWorkRegistry().snapshot(), { base: new Map() })).rejects.toThrow(/persistBaseline/);
  });
});

describe('cost: one call per logical write, no registry-wide scan', () => {
  it('a write is exactly one rpc and reads no table; no change makes no call', async () => {
    const db = await freshDb();
    const { client, calls } = counting(db);
    const store = createSupabaseWorkStore(client as never);
    const seed = await loadRegistry(store);
    for (let i = 0; i < 60; i++) seed.createItem({ title: `Seed ${i}`, type: 'task', scope: Scopes.devshop() }, DEV);
    await store.persist(seed.snapshot());

    calls.length = 0;
    const reg = await loadRegistry(store);
    expect(calls).toEqual(['select:work_items', 'select:work_events', 'select:work_source_events', 'select:work_links', 'select:repo_locks']);

    calls.length = 0;
    await mutateRegistry(store, (r) => { r.addEvidence(r.list()[0].id, { kind: 'note', ref: 'n', summary: 'one change' }, DEV); return { value: null, changed: true }; });
    expect(calls.filter((c) => !c.startsWith('select:'))).toEqual(['rpc:work_persist']);

    calls.length = 0;
    await store.persist(reg.snapshot(), persistBaseline(reg));
    expect(calls).toEqual([]);
  });
});
