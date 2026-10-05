import { describe, expect, it } from 'vitest';
import {
  createSupabaseWorkStore, DbWorkRegistry,
  type HealthRun, type WorkItem,
} from '../../../src/lib/work';
import { runHealthIngestion, type HealthRunnerResult } from '../../../src/lib/work/health-runner';

// Reuse the fake-Supabase pattern from db-store.test.ts
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
        async upsert(input: unknown[]) {
          for (const r0 of input as Record<string, unknown>[]) {
            const r = { ...r0 };
            if (t === 'work_items' && !('ref' in r)) r.ref = `W-${String(++refCounter).padStart(4, '0')}`;
            get(t).set(keyOf(t, r), r);
          }
          return { error: null };
        },
        async insert(input: unknown[]) {
          const rows = input as Record<string, unknown>[];
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

const NOW = '2026-10-05T10:00:00.000Z';

const passingRun: HealthRun = {
  at: NOW,
  report: [
    { brand: 'viratmohan', failed: 0, results: [{ check: 'page /', ok: true }] },
    { brand: 'moonglasses', failed: 0, results: [{ check: 'page /', ok: true }, { check: 'COD off', ok: true }] },
  ],
};

const failingRun: HealthRun = {
  at: NOW,
  report: [
    { brand: 'viratmohan', failed: 1, results: [{ check: 'page /', ok: true }, { check: 'page /mission', ok: false, detail: '500 230ms' }] },
    { brand: 'moonglasses', failed: 1, results: [{ check: 'COD off', ok: false, detail: 'codEnabled was true' }] },
  ],
};

function makeStore() {
  const { client } = fakeSupabase();
  return createSupabaseWorkStore(client);
}

describe('health runner', () => {
  it('all-passing run creates no work items', async () => {
    const store = makeStore();
    const r = await runHealthIngestion(store, passingRun);
    expect(r.ok).toBe(true);
    expect(r.outcome!.failing_checks).toBe(0);
    expect(r.outcome!.created).toBe(0);
    const { items } = await store.loadAll();
    expect(items).toHaveLength(0);
  });

  it('failing checks create work items as incidents', async () => {
    const store = makeStore();
    const r = await runHealthIngestion(store, failingRun);
    expect(r.ok).toBe(true);
    expect(r.outcome!.failing_checks).toBe(2);
    expect(r.outcome!.created).toBe(2);
    const { items } = await store.loadAll();
    expect(items).toHaveLength(2);
    expect(items.every((i: WorkItem) => i.type === 'incident')).toBe(true);
    expect(items.every((i: WorkItem) => i.state === 'new')).toBe(true);
  });

  it('re-ingesting the same run is idempotent (duplicate events)', async () => {
    const store = makeStore();
    await runHealthIngestion(store, failingRun);
    const r2 = await runHealthIngestion(store, failingRun);
    expect(r2.ok).toBe(true);
    expect(r2.outcome!.duplicate).toBe(2);
    expect(r2.outcome!.created).toBe(0);
    const { items } = await store.loadAll();
    expect(items).toHaveLength(2);
  });

  it('same check failing on a later run attaches to the existing open item', async () => {
    const store = makeStore();
    await runHealthIngestion(store, failingRun);
    const laterRun: HealthRun = {
      at: '2026-10-05T12:00:00.000Z',
      report: [{ brand: 'moonglasses', failed: 1, results: [{ check: 'COD off', ok: false, detail: 'still true' }] }],
    };
    const r = await runHealthIngestion(store, laterRun);
    expect(r.ok).toBe(true);
    expect(r.outcome!.attached).toBe(1);
    expect(r.outcome!.created).toBe(0);
    const { items } = await store.loadAll();
    expect(items).toHaveLength(2); // still 2, not 3
  });

  it('viratmohan brand resolves to null scope (DevShop, not a brand)', async () => {
    const store = makeStore();
    const run: HealthRun = {
      at: NOW,
      report: [{ brand: 'viratmohan', failed: 1, results: [{ check: 'page /', ok: false, detail: '503' }] }],
    };
    const r = await runHealthIngestion(store, run);
    expect(r.ok).toBe(true);
    const { items } = await store.loadAll();
    expect(items).toHaveLength(1);
    expect(items[0].scope.brand).toBeNull();
  });

  it('known brand resolves to its brand key', async () => {
    const store = makeStore();
    const run: HealthRun = {
      at: NOW,
      report: [{ brand: 'travaholic', failed: 1, results: [{ check: 'page /', ok: false, detail: '500' }] }],
    };
    await runHealthIngestion(store, run);
    const { items } = await store.loadAll();
    expect(items[0].scope.brand).toBe('travaholic');
  });

  it('unknown brand with failures returns an error, does not create misattributed items', async () => {
    const store = makeStore();
    const run: HealthRun = {
      at: NOW,
      report: [{ brand: 'unknown_brand', failed: 1, results: [{ check: 'page /', ok: false, detail: '404' }] }],
    };
    const r = await runHealthIngestion(store, run);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unknown brand');
    const { items } = await store.loadAll();
    expect(items).toHaveLength(0);
  });

  it('unknown brand with only passing checks is fine (no work to attribute)', async () => {
    const store = makeStore();
    const run: HealthRun = {
      at: NOW,
      report: [{ brand: 'unknown_brand', failed: 0, results: [{ check: 'page /', ok: true }] }],
    };
    const r = await runHealthIngestion(store, run);
    expect(r.ok).toBe(true);
    expect(r.outcome!.created).toBe(0);
  });

  it('invalid run (missing at) returns error', async () => {
    const store = makeStore();
    const r = await runHealthIngestion(store, { at: '', report: [] } as HealthRun);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('timestamp');
  });

  it('invalid run (missing report) returns error', async () => {
    const store = makeStore();
    const r = await runHealthIngestion(store, { at: NOW } as unknown as HealthRun);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('report');
  });

  it('custom brandMap overrides defaults', async () => {
    const store = makeStore();
    const run: HealthRun = {
      at: NOW,
      report: [{ brand: 'custom', failed: 1, results: [{ check: 'page /', ok: false, detail: '500' }] }],
    };
    const r = await runHealthIngestion(store, run, { brandMap: { custom: 'my-brand' } });
    expect(r.ok).toBe(true);
    const { items } = await store.loadAll();
    expect(items[0].scope.brand).toBe('my-brand');
  });

  it('typeHint overrides the default incident type', async () => {
    const store = makeStore();
    const run: HealthRun = {
      at: NOW,
      report: [{ brand: 'moonglasses', failed: 1, results: [{ check: 'UPI on', ok: false }] }],
    };
    await runHealthIngestion(store, run, { typeHint: 'alert' });
    const { items } = await store.loadAll();
    expect(items[0].type).toBe('alert');
  });

  it('store failure is caught and returned as error, never thrown', async () => {
    const badStore = {
      async loadAll() { throw new Error('connection refused'); },
      async persist() {},
    };
    const r = await runHealthIngestion(badStore, failingRun);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('store error');
    expect(r.error).toContain('connection refused');
  });
});
