import { describe, expect, it } from 'vitest';
import {
  createSupabaseWorkStore, loadRegistry, withRegistry, DbWorkRegistry, rowFromItem, itemFromRow, rowFromEvent,
  InMemoryWorkRegistry, Scopes, type WorkItem, type SourceEvent, type WorkLink, type RepoLock,
} from '../../../src/lib/work';
import { CHECK, DEV, SG_CEO, VIRAT, makeRegistry, must } from './helpers';
import { fixtureA, fixtureB, fixtureC, fixtureD, fixtureE, fixtureF, fixtureG } from './fixtures';

// ── A fake Supabase client over Maps: the same builder surface createSupabaseWorkStore uses, and the
//    same rules the real tables enforce (generated ref, append-only chained events, unique keys). It
//    lets the REAL store code run without a network. Hosted-DB proof is a separate rolled-back round trip.
function fakeSupabase() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const seqByItem = new Map<string, number>();
  let refCounter = 0;
  const get = (t: string) => tables.get(t) ?? tables.set(t, new Map()).get(t)!;
  const keyOf = (t: string, row: Record<string, unknown>) =>
    t === 'work_events' ? `${row.work_id}:${row.seq}` : String(row.id);
  const client = {
    from(t: string) {
      return {
        async select() { return { data: [...get(t).values()], error: null }; },
        async upsert(rows: Record<string, unknown>[], opts?: { onConflict: string }) {
          for (const r0 of rows) {
            const r = { ...r0 };
            if (t === 'work_items' && !('ref' in r)) r.ref = `W-${String(++refCounter).padStart(4, '0')}`;
            get(t).set(keyOf(t, r), r);
          }
          void opts; return { error: null };
        },
        async insert(rows: Record<string, unknown>[]) {
          for (const r of rows) {
            if (t === 'work_events') {
              const last = seqByItem.get(String(r.work_id)) ?? 0;
              if ((r.seq as number) !== last + 1) return { error: { message: `chain: expected ${last + 1}` } };
              seqByItem.set(String(r.work_id), r.seq as number);
            }
            const k = keyOf(t, r);
            if (get(t).has(k)) return { error: { message: 'duplicate key' } };
            get(t).set(k, { ...r });
          }
          return { error: null };
        },
      };
    },
  };
  return { client, tables };
}

const strip = (i: WorkItem) => { const { ref, ...rest } = i; return rest; };

describe('mappers are lossless', () => {
  it('rowFromItem → itemFromRow returns the original item (ref aside, which the database owns)', () => {
    const { reg } = makeRegistry();
    fixtureB(reg); fixtureC(reg); fixtureF(reg);
    for (const it of reg.list()) {
      const row = rowFromItem(it);
      const back = itemFromRow(row, it.events.map((e) => rowFromEvent(it.id, e)), it.source_event_ids);
      back.ref = it.ref;
      expect(back).toEqual(it);
    }
  });
});

describe('createSupabaseWorkStore: persist and load the whole registry', () => {
  const seeded = () => {
    const { reg } = makeRegistry({ lockPolicy: { exclusiveRepositories: ['sample-store'] } });
    fixtureA(reg); fixtureB(reg); fixtureC(reg); fixtureD(reg); fixtureE(reg); fixtureF(reg); fixtureG(reg);
    return reg;
  };

  it('a full snapshot survives a persist → load round trip, and every audit chain still verifies', async () => {
    const source = seeded();
    const { client } = fakeSupabase();
    const store = createSupabaseWorkStore(client as never);
    await store.persist(source.snapshot());
    const loaded = await loadRegistry(store);

    const byId = new Map(loaded.list().map((i) => [i.id, i]));
    expect(byId.size).toBe(source.list().length);
    for (const original of source.list()) {
      const back = byId.get(original.id)!;
      expect(strip(back)).toEqual(strip(original)); // everything but the DB-owned ref
      expect(must(loaded.verifyAudit(original.id))).toEqual({ ok: true });
    }
    // source events, links and locks came back too
    expect(loaded.allSourceEvents().length).toBe(source.allSourceEvents().length);
    expect(loaded.links_().length).toBe(source.links_().length);
    expect(loaded.list().flatMap((i) => loaded.locksOf(i.id)).length).toBe(source.list().flatMap((i) => source.locksOf(i.id)).length);
  });

  it('persist is append-only for events and idempotent: persisting the same snapshot twice is a no-op', async () => {
    const source = seeded();
    const { client, tables } = fakeSupabase();
    const store = createSupabaseWorkStore(client as never);
    await store.persist(source.snapshot());
    const events1 = tables.get('work_events')!.size;
    await store.persist(source.snapshot()); // again
    expect(tables.get('work_events')!.size).toBe(events1); // no duplicate events, no chain error
  });

  it('DbWorkRegistry: a create, then a later load, sees the item; a transition persists across loads', async () => {
    const { client } = fakeSupabase();
    const db = new DbWorkRegistry(createSupabaseWorkStore(client as never), { directory: { kindOf: (id) => (id === 'DS-02' || id === 'SG-01' || id === 'DS-10' ? 'agent' : id === 'DS-00' ? 'human' : null) }, knownBrands: new Set(['sample']) });
    const created = await db.mutate((reg) => reg.createItem({ type: 'incident', title: 'Checkout 500s', scope: Scopes.brand('sample') }, DEV));
    expect(created.ok).toBe(true);
    const id = created.ok ? created.value.id : '';
    expect(await db.read((reg) => reg.get(id)?.state)).toBe('new');
    expect((await db.mutate((reg) => reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P1' } } }))).ok).toBe(true);
    expect(await db.read((reg) => reg.get(id)?.state)).toBe('triaged');
    expect(await db.read((reg) => reg.get(id)?.priority)).toBe('P1');
    // a failed op persists nothing
    const bad = await db.mutate((reg) => reg.transition(id, 'closed', DEV));
    expect(bad.ok).toBe(false);
    expect(await db.read((reg) => reg.get(id)?.state)).toBe('triaged');
  });

  it('the full lifecycle works through the database-backed registry', async () => {
    const { client } = fakeSupabase();
    const dir = { kindOf: (id: string) => (['DS-02', 'SG-01', 'DS-10'].includes(id) ? 'agent' as const : id === 'DS-00' ? 'human' as const : null) };
    const db = new DbWorkRegistry(createSupabaseWorkStore(client as never), { directory: dir, knownBrands: new Set(['sample']) });
    const id = (await db.mutate((r) => r.createItem({ type: 'task', title: 'Add a size chart', scope: Scopes.brand('sample') }, DEV))).ok
      ? (await db.read((r) => r.list()[0].id)) : '';
    await db.mutate((r) => r.transition(id, 'triaged', DEV, { payload: { triage: { priority: 'P3' } } }));
    await db.mutate((r) => r.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
    await db.mutate((r) => r.transition(id, 'in_progress', SG_CEO));
    await db.mutate((r) => r.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'completed', summary: 'done' } } }));
    await db.mutate((r) => r.transition(id, 'verification', CHECK));
    const closed = await db.mutate((r) => r.transition(id, 'closed', CHECK, { payload: { closure: { method: 'checked', evidence: [{ kind: 'note', ref: 'n', summary: 's' }] } } }));
    expect(closed.ok).toBe(true);
    expect(await db.read((r) => r.get(id)?.state)).toBe('closed');
    expect(await db.read((r) => must(r.verifyAudit(id)))).toEqual({ ok: true });
  });
});
