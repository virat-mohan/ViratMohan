// The health report endpoint must fail closed: a run whose failures were not recorded in the Work Registry is an error.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { insertError: null as null | { message: string }, ingest: { ok: true, outcome: { created: 1, attached: 0 } } as { ok: boolean; outcome?: { created: number; attached: number }; error?: string } | 'throw', inserts: 0, ingests: 0 };

vi.mock('../../../src/lib/env', () => ({ getEnv: () => ({ CRON_SECRET: 'secret' }) }));
vi.mock('../../../src/lib/ledger', () => ({
  serviceDb: () => ({ from: () => ({ insert: () => { state.inserts++; return { select: () => ({ single: async () => (state.insertError ? { data: null, error: state.insertError } : { data: { id: 'h1' }, error: null }) }) }; } }) }),
}));
vi.mock('../../../src/lib/work/db-store', () => ({ createSupabaseWorkStore: () => ({}) }));
vi.mock('../../../src/lib/work/health-runner', () => ({
  runHealthIngestion: async () => { state.ingests++; if (state.ingest === 'throw') throw new Error('work_persist is not installed in this database'); return state.ingest; },
}));

import { POST } from '../../../src/pages/retail-os/api/health/report';

const call = (auth: string | null, body: unknown) =>
  POST({ request: new Request('http://x/retail-os/api/health/report', { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }) } as never);
const failing = { at: '2026-10-06T00:00:00Z', report: [{ brand: 'b', failed: 2, results: [] }] };
const passing = { at: '2026-10-06T00:00:00Z', report: [{ brand: 'b', failed: 0, results: [] }] };

beforeEach(() => { state.insertError = null; state.ingest = { ok: true, outcome: { created: 1, attached: 0 } }; state.inserts = 0; state.ingests = 0; });

describe('health report endpoint', () => {
  it('refuses a request without the bearer secret before touching the database', async () => {
    expect((await call(null, failing)).status).toBe(401);
    expect((await call('Bearer wrong', failing)).status).toBe(401);
    expect(state.inserts).toBe(0);
  });

  it('records failures in the Work Registry and answers 200 ok', async () => {
    const res = await call('Bearer secret', failing);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, failed: 2, work: { ok: true, created: 1 } });
  });

  it('fails closed when ingestion reports an error: 500 and ok false, never success', async () => {
    state.ingest = { ok: false, error: 'conflict' };
    const res = await call('Bearer secret', failing);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, work: { ok: false, error: 'conflict' } });
  });

  it('fails closed when work_persist is missing (the store throws): 500 and ok false', async () => {
    state.ingest = 'throw';
    const res = await call('Bearer secret', failing);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.work.error).toMatch(/work_persist is not installed/);
  });

  it('a clean run writes no Work and answers 200', async () => {
    const res = await call('Bearer secret', passing);
    expect(res.status).toBe(200);
    expect(state.ingests).toBe(0);
  });

  it('a failed health_runs insert is an error', async () => {
    state.insertError = { message: 'db down' };
    expect((await call('Bearer secret', failing)).status).toBe(500);
    expect(state.ingests).toBe(0);
  });
});
