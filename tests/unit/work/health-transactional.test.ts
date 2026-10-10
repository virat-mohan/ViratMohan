// The health report path (Health Check -> Health Report -> Work Registry -> Control Tower) on the transactional store.
// SCHEMA-VERIFIED against the real migrations in embedded Postgres; not a live Supabase project.
import { describe, expect, it } from 'vitest';
import { createSupabaseWorkStore } from '../../../src/lib/work/db-store';
import { loadRegistry } from '../../../src/lib/work/db-registry';
import { runHealthIngestion } from '../../../src/lib/work/health-runner';
import { buildControlTowerView } from '../../../src/lib/control-tower/view';
import type { HealthRun } from '../../../src/lib/work';
import { freshDb, pgClient } from './pg-client';

const failing: HealthRun = {
  at: '2026-10-06T00:00:00.000Z',
  report: [{ brand: 'viratmohan', failed: 1, results: [{ check: 'page /', ok: true }, { check: 'page /mission', ok: false, detail: '500 230ms' }] }],
};
const count = async (db: Awaited<ReturnType<typeof freshDb>>, t: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${t}`)).rows[0].n);

describe('health report writes go through work_persist', () => {
  it('creates the incident in one transactional write, attaches the repeat, and the Control Tower sees it', async () => {
    const db = await freshDb();
    const store = createSupabaseWorkStore(pgClient(db) as never);
    const first = await runHealthIngestion(store, failing);
    expect(first.ok).toBe(true);
    expect(first.outcome?.created).toBe(1);
    const again = await runHealthIngestion(store, failing);
    expect(again.ok).toBe(true);
    expect(again.outcome?.created).toBe(0);
    expect(await count(db, 'work_items')).toBe(1);
    const reg = await loadRegistry(store);
    expect(reg.list().every((i) => reg.verifyAudit(i.id).ok)).toBe(true);
    expect(buildControlTowerView(reg).total).toBe(1);
  });

  it('fails closed when work_persist is not installed: nothing is written and the error says what to do', async () => {
    const db = await freshDb({ without0056: true });
    const store = createSupabaseWorkStore(pgClient(db) as never);
    const r = await runHealthIngestion(store, failing);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/work_persist is not installed/);
    expect(r.error).toMatch(/0056_work_persist\.sql/);
    expect(await count(db, 'work_items')).toBe(0);
    expect(await count(db, 'work_events')).toBe(0);
  });

  it('fails closed when the client has no rpc at all, rather than writing several statements', async () => {
    const db = await freshDb();
    const { rpc: _omit, ...noRpc } = pgClient(db);
    const r = await runHealthIngestion(createSupabaseWorkStore(noRpc as never), failing);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/only safe write path/);
    expect(await count(db, 'work_items')).toBe(0);
  });
});
