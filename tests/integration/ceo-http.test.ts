// The real path, end to end: HTTP -> Astro dev server (middleware + route + handler) -> real CEO runtime ->
// real Work Registry store through the real supabase-js client -> real schema (migration 0055, triggers included)
// -> back out through the real Founder Control Tower page. Only the network endpoint is swapped for a local
// PostgREST-compatible shim over embedded Postgres; no Supabase project is touched.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import type { PGlite } from '@electric-sql/pglite';
import { createSupabaseWorkStore } from '../../src/lib/work/db-store';
import { loadRegistry } from '../../src/lib/work/db-registry';
import { freshDb, pgClient } from '../unit/work/pg-client';
import { startShim } from './postgrest-shim';

const APP = 4411, SHIM = 4412, PASSWORD = 'it-pass';
const BASE = `http://127.0.0.1:${APP}`;
const AUTH = 'Basic ' + Buffer.from(`admin:${PASSWORD}`).toString('base64');
// One short token, no routing keywords: the matcher needs two shared tokens, so the marker alone never links two requests.
const TEST_TAG = '[IT-TEST] ';

let db: PGlite, shim: ReturnType<typeof startShim>, app: ChildProcess;

const post = (body: unknown, auth: string | null = AUTH, raw = false) =>
  fetch(`${BASE}/retail-os/api/admin/ceo-input`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: raw ? (body as string) : JSON.stringify(body) });
const ceo = async (text: string, extra: Record<string, unknown> = {}) => {
  const res = await post({ text, ...extra });
  return { status: res.status, body: (await res.json()) as any };
};
const registry = () => loadRegistry(createSupabaseWorkStore(pgClient(db) as never));
const eventCount = async () => Number((await db.query<{ n: number }>('select count(*)::int as n from work_events')).rows[0].n);

beforeAll(async () => {
  db = await freshDb();
  shim = startShim(SHIM, db);
  await shim.ready;
  app = spawn(process.execPath, ['node_modules/astro/astro.js', 'dev', '--port', String(APP), '--host', '127.0.0.1', '--strictPort'], {
    env: { ...process.env, ADMIN_PASSWORD: PASSWORD, SUPABASE_URL: `http://127.0.0.1:${SHIM}`, SUPABASE_SERVICE_ROLE_KEY: 'shim-key', CRON_SECRET: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/retail-os/admin/control-tower`)).status === 401) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  await fetch(`${BASE}/retail-os/admin/control-tower`, { headers: { authorization: AUTH } });
}, 180_000);

afterAll(() => { app?.kill('SIGTERM'); shim?.server.close(); });

beforeEach(async () => { db = await freshDb(); shim.setDb(db); });

describe('authentication and authorisation', () => {
  it('refuses unauthenticated, wrong-user and wrong-password requests and writes nothing', async () => {
    expect((await post({ text: 'Fix it' }, null)).status).toBe(401);
    expect((await post({ text: 'Fix it' }, 'Basic ' + Buffer.from(`other:${PASSWORD}`).toString('base64'))).status).toBe(401);
    expect((await post({ text: 'Fix it' }, 'Basic ' + Buffer.from('admin:wrong').toString('base64'))).status).toBe(401);
    expect((await registry()).list().length).toBe(0);
  }, 60_000);

  it('the Control Tower page is also gated', async () => {
    expect((await fetch(`${BASE}/retail-os/admin/control-tower?tab=pipeline`)).status).toBe(401);
  });
});

describe('input validation', () => {
  it('refuses malformed, empty, oversized, unknown-brand and unknown-work input', async () => {
    expect((await post('{not json', AUTH, true)).status).toBe(400);
    expect((await ceo('   ')).status).toBe(400);
    expect((await ceo('x'.repeat(2001))).status).toBe(400);
    expect((await ceo('Fix it', { brand: 'not-a-brand' })).status).toBe(400);
    expect((await ceo('Here is proof', { work_id: '00000000-0000-0000-0000-000000000000' })).status).toBe(400);
    expect((await registry()).list().length).toBe(0);
  }, 60_000);
});

describe('Founder request to real persisted Work', () => {
  it('creates Work through the real route, persists it, and returns its reference', async () => {
    const r = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    expect(r.status).toBe(200);
    expect(r.body.outcome).toMatchObject({ kind: 'work_created', operation: 'create_work', mutationApplied: true });
    expect(r.body.work).toMatchObject({ state: 'assigned', owner: 'MG-01', priority: 'P3' });
    const reg = await registry();
    const item = reg.get(r.body.work.id)!;
    expect(item.title).toBe(`${TEST_TAG}Fix the Moon checkout`);
    expect(item.scope.brand).toBe('moonglasses');
    expect(item.source.channel).toBe('founder_request');
    expect(reg.verifyAudit(item.id).ok).toBe(true);
    expect(reg.actionsOf(item.id).length).toBe(1);
  }, 60_000);

  it('a status question reads and writes nothing', async () => {
    await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    const before = await eventCount();
    const r = await ceo('What needs my attention this morning?');
    expect(r.body.outcome).toMatchObject({ kind: 'question_answered', operation: 'read', mutationApplied: false });
    expect(await eventCount()).toBe(before);
  }, 60_000);

  it('Moon request A does not attach to unrelated open Moon work B; an explicit reference does', async () => {
    const b = await ceo(`${TEST_TAG}Update product photos`, { brand: 'moonglasses' });
    const a = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    expect(b.body.outcome.kind).toBe('work_created');
    expect(a.body.outcome).toMatchObject({ kind: 'work_created', reusedExistingWork: false });
    expect(a.body.work.id).not.toBe(b.body.work.id);
    expect((await registry()).list().length).toBe(2);

    const ev = await ceo('Here is the screenshot', { work_id: b.body.work.id });
    expect(ev.body.outcome).toMatchObject({ kind: 'evidence_attached', operation: 'attach_evidence' });
    const reg = await registry();
    expect(reg.get(b.body.work.id)!.evidence.length).toBe(1);
    expect(reg.get(a.body.work.id)!.evidence.length).toBe(0);
  }, 90_000);

  it('repeating the same request reuses the Work instead of duplicating it', async () => {
    const first = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    const again = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    expect(again.body.outcome).toMatchObject({ kind: 'work_updated', operation: 'update_work', reusedExistingWork: true });
    expect(again.body.work.id).toBe(first.body.work.id);
    expect((await registry()).list().length).toBe(1);
  }, 60_000);
});

describe('technical deployment through the real path', () => {
  it('opens Work, gates on Virat, then assigns the configured role holder only after approval', async () => {
    const a = await ceo(`${TEST_TAG}Set up the DNS for Moon`, { brand: 'moonglasses' });
    expect(a.body.routing).toMatchObject({ role: 'technical_deployment_officer', currentHolders: ['Prince Keshri'] });
    expect(a.body.work).toMatchObject({ state: 'pending_approval', owner: 'DS-02' });
    expect(a.body.work.approval).toMatchObject({ authority: 'prince_assignment', requestedFrom: 'virat', decided: null });
    expect(a.body.escalation.required).toBe(true);

    const ok = await ceo('Approved, go ahead');
    expect(ok.body.outcome).toMatchObject({ kind: 'approval_recorded', operation: 'record_approval' });
    const item = (await registry()).get(a.body.work.id)!;
    expect(item.owner?.id).toBe('P-01');
    expect(item.approval?.decision).toMatchObject({ outcome: 'approved' });
    expect(item.approval?.decision?.by.id).toBe('DS-00');
  }, 90_000);
});

describe('Control Tower sees the Work', () => {
  it('the real page, loading the real store, shows the Work and its pending approval', async () => {
    const a = await ceo(`${TEST_TAG}Set up the DNS for Moon`, { brand: 'moonglasses' });
    expect(a.status).toBe(200);
    const pipeline = await (await fetch(`${BASE}/retail-os/admin/control-tower?tab=pipeline`, { headers: { authorization: AUTH } })).text();
    expect(pipeline).toContain('1 work items loaded');
    expect(pipeline).toContain('Set up the DNS for Moon');
    expect(pipeline).toContain('Pending approval');
    expect(a.body.work.ref).toMatch(/^W-\d{4}$/);
    const board = await (await fetch(`${BASE}/retail-os/admin/control-tower?tab=board`, { headers: { authorization: AUTH } })).text();
    const text = board.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('1 Open work 0 Critical 0 Blocked 1 Pending approval');
    expect(text).toContain('Set up the DNS for Moon');
  }, 90_000);
});

describe('two real concurrent requests', () => {
  it('creating different Work both land', async () => {
    const [x, y] = await Promise.all([
      ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' }),
      ceo(`${TEST_TAG}Update the Caps homepage banner`, { brand: 'caps' }),
    ]);
    expect([x.status, y.status]).toEqual([200, 200]);
    expect((await registry()).list().length).toBe(2);
  }, 90_000);

  it('evidence on the same Work from two requests: neither is lost', async () => {
    const w = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    const [x, y] = await Promise.all([
      ceo('Here is the screenshot one', { work_id: w.body.work.id }),
      ceo('Here is the screenshot two', { work_id: w.body.work.id }),
    ]);
    expect([x.status, y.status]).toEqual([200, 200]);
    const reg = await registry();
    expect(reg.get(w.body.work.id)!.evidence.length).toBe(2);
    expect(reg.verifyAudit(w.body.work.id).ok).toBe(true);
  }, 90_000);
});
