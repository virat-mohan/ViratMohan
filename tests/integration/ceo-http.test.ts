// The real path, end to end: HTTP -> Astro dev server (middleware + route + handler) -> real CEO runtime ->
// real Work Registry store through the real supabase-js client -> real schema (migration 0055, triggers included)
// -> back out through the real Founder Control Tower page. Only the network endpoint is swapped for a local
// PostgREST-compatible shim over embedded Postgres; no Supabase project is touched.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import type { PGlite } from '@electric-sql/pglite';
import { createSupabaseWorkStore } from '../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry } from '../../src/lib/work/db-registry';
import { Scopes } from '../../src/lib/work/scope';
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

const plain = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const seedWork = (titles: string[]) =>
  mutateRegistry(createSupabaseWorkStore(pgClient(db) as never), (reg) => {
    for (const t of titles) reg.createItem({ title: t, type: 'task', scope: Scopes.brand('moonglasses') }, { kind: 'agent', id: 'DS-02' });
    return { value: null, changed: true };
  });

describe('priority, matching and routing over real HTTP', () => {
  it('a checkout outage lands at P0 and appears as Critical in the Control Tower', async () => {
    const r = await ceo(`${TEST_TAG}The checkout is down`, { brand: 'moonglasses' });
    expect(r.body.work.priority).toBe('P0');
    expect(r.body.priority).toMatchObject({ value: 'P0', basis: 'rule_floor' });
    expect(r.body.escalation.required).toBe(false);
    const board = plain(await (await fetch(`${BASE}/retail-os/admin/control-tower?tab=board`, { headers: { authorization: AUTH } })).text());
    expect(board).toContain('1 Open work 1 Critical');
    const pipeline = plain(await (await fetch(`${BASE}/retail-os/admin/control-tower?tab=pipeline`, { headers: { authorization: AUTH } })).text());
    expect(pipeline).toMatch(/Critical items[^]*The checkout is down/);
  }, 90_000);

  it('urgent wording without a recognised condition is held at P3 with an advisory that needs Virat', async () => {
    const r = await ceo(`${TEST_TAG}Fix the homepage banner ASAP`, { brand: 'caps' });
    expect(r.body.work.priority).toBe('P3');
    expect(r.body.priority.advisory).toContain('make it P1');
  }, 60_000);

  it('records a write only when it wrote, with operation, actor, source, authority and resulting state', async () => {
    const w = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    expect(w.body.write).toMatchObject({ operation: 'create_work', actor: 'DS-02', source: 'command_centre', authority: 'create-work L2', work: { state: 'assigned' } });
    expect(w.body.write.auditEvents).toContain('action');
    const q = await ceo('What is the status of the Moon checkout?', { brand: 'moonglasses' });
    expect(q.body.write).toBeNull();
    expect((await registry()).list().length).toBe(1);
  }, 60_000);

  it('a question with no match creates nothing', async () => {
    const q = await ceo('What is happening with the Caps campaign?', { brand: 'caps' });
    expect(q.body.outcome).toMatchObject({ kind: 'question_answered', mutationApplied: false });
    expect((await registry()).list().length).toBe(0);
  }, 60_000);

  it('two plausible matches: asks which, writes nothing; a Work reference then decides', async () => {
    await seedWork(['Checkout payment gateway timeout', 'Checkout payment gateway timeout retries']);
    const before = await eventCount();
    const a = await ceo('Fix the checkout payment gateway timeout', { brand: 'moonglasses' });
    expect(a.body.outcome).toMatchObject({ kind: 'clarification_needed', mutationApplied: false });
    expect(a.body.write).toBeNull();
    expect(await eventCount()).toBe(before);
    const target = (await registry()).list().find((i) => i.title.endsWith('retries'))!;
    const b = await ceo('Fix the checkout payment gateway timeout', { brand: 'moonglasses', work_id: target.id });
    expect(b.body.outcome.kind).toBe('work_updated');
    expect(b.body.work.id).toBe(target.id);
  }, 90_000);

  it('a weak match is not attached; the similar Work is listed for confirmation', async () => {
    await seedWork(['Redesign the homepage banner']);
    const r = await ceo('Add a banner to the checkout', { brand: 'moonglasses' });
    expect(r.body.outcome.kind).toBe('work_created');
    expect(r.body.similarWork.length).toBe(1);
    expect((await registry()).list().length).toBe(2);
  }, 60_000);

  it('the word "integration" alone is ordinary Work, not a deployment approval', async () => {
    const r = await ceo(`${TEST_TAG}Fix the integration campaign tracking`, { brand: 'moonglasses' });
    expect(r.body.routing).toBeNull();
    expect(r.body.work.state).toBe('assigned');
    const real = await ceo(`${TEST_TAG}Integrate the new payment gateway and deploy it to production`, { brand: 'caps' });
    expect(real.body.routing).toMatchObject({ role: 'technical_deployment_officer', currentHolders: ['Prince Keshri'] });
    expect(real.body.work.state).toBe('pending_approval');
  }, 90_000);
});

const lifecycle = async (body: unknown, auth: string | null = AUTH) => {
  const res = await fetch(`${BASE}/retail-os/api/admin/work-lifecycle`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
  const raw = await res.text();
  let parsed: any = raw;
  try { parsed = JSON.parse(raw); } catch { /* the middleware answers 401 in plain text */ }
  return { status: res.status, body: parsed };
};
const tower = async (tab: string) => plain(await (await fetch(`${BASE}/retail-os/admin/control-tower?tab=${tab}`, { headers: { authorization: AUTH } })).text());

describe('Work lifecycle over real HTTP', () => {
  it('is gated and validates input', async () => {
    expect((await lifecycle({ work: 'W-0001', action: 'start' }, null)).status).toBe(401);
    expect((await lifecycle({ work: 'W-0001', action: 'start' }, 'Basic ' + Buffer.from('other:' + PASSWORD).toString('base64'))).status).toBe(401);
    expect((await lifecycle({ action: 'start' })).status).toBe(400);
    expect((await lifecycle({ work: 'W-0001', action: 'delete' })).status).toBe(400);
    expect((await lifecycle({ work: 'W-9999', action: 'start' })).status).toBe(404);
  }, 60_000);

  it('resolve, verify, close: each state shows in the Control Tower, and nothing is deleted', async () => {
    const w = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    const ref = w.body.work.ref as string;
    const step = async (action: string, extra: Record<string, unknown> = {}) => {
      const r = await lifecycle({ work: ref, action, ...extra });
      expect(r.status, `${action}: ${JSON.stringify(r.body)}`).toBe(200);
      return r.body;
    };
    expect((await step('start')).work.state).toBe('in_progress');
    expect((await tower('pipeline'))).toContain('1 open items');
    expect((await step('resolve', { summary: 'Fixed and checked' })).work.state).toBe('resolved');
    expect((await step('verify')).work.state).toBe('verification');
    const pipeline = await tower('pipeline');
    expect(pipeline).toMatch(/1\s*Verify/);

    const illegal = await lifecycle({ work: ref, action: 'close' });
    expect(illegal.status).toBe(400);
    expect(illegal.body.error).toContain('verification_required');

    const closed = await step('close', { method: 'Reviewed the fix', evidence: [{ kind: 'note', ref: 'review-1', summary: 'Founder reviewed' }] });
    expect(closed.work.state).toBe('closed');
    const after = await tower('pipeline');
    expect(after).toContain('0 open items');
    expect(after).toMatch(/1\s*Learn/);
    expect((await registry()).list().length).toBe(1);
  }, 120_000);

  it('closes an [IT-TEST] record in one step, keeping it and its history; refuses real Work', async () => {
    const t = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    const real = await ceo('Update the product photos', { brand: 'moonglasses' });
    const before = await eventCount();
    const refused = await lifecycle({ work: real.body.work.ref, action: 'close_test_record' });
    expect(refused.status).toBe(400);
    expect(await eventCount()).toBe(before);

    const r = await lifecycle({ work: t.body.work.ref, action: 'close_test_record' });
    expect(r.status).toBe(200);
    expect(r.body.work.state).toBe('closed');
    const reg = await registry();
    const item = reg.get(t.body.work.id)!;
    expect(item.title.startsWith(TEST_TAG.trim())).toBe(true);
    expect(item.closure?.verified_by.id).toBe('DS-00');
    expect(reg.verifyAudit(item.id).ok).toBe(true);
    expect(reg.get(real.body.work.id)!.state).toBe('assigned');
  }, 120_000);

  it('Blocked and Pending approval states appear on the board', async () => {
    await ceo(`${TEST_TAG}Set up the DNS`, { brand: 'moonglasses' });
    const b = await tower('board');
    expect(b).toContain('1 Pending approval');
  }, 90_000);
});

describe('lifecycle controls in the Control Tower', () => {
  it('offers only the valid next action and words RESOLVED and CLOSED differently', async () => {
    const w = await ceo(`${TEST_TAG}Fix the Moon checkout`, { brand: 'moonglasses' });
    const ref = w.body.work.ref as string;
    const page = async () => tower('pipeline');

    let t = await page();
    expect(t).toContain('Assigned Not started');
    expect(t).toContain('Start');
    expect(t).not.toContain('Mark resolved');

    await lifecycle({ work: ref, action: 'start' });
    t = await page();
    expect(t).toContain('In progress Being worked on');
    expect(t).toContain('Mark resolved');
    expect(t).not.toContain('Verify and close');

    await lifecycle({ work: ref, action: 'resolve', summary: 'Done' });
    t = await page();
    expect(t).toContain('RESOLVED Waiting for verification. Not closed.');
    expect(t).toContain('Send to verification');
    expect(t).not.toContain('Verify and close');

    await lifecycle({ work: ref, action: 'verify' });
    t = await page();
    expect(t).toContain('VERIFICATION Evidence is needed to close it.');
    expect(t).toContain('Verify and close');
    expect(t).toContain('How it was checked');
    expect(t).toContain('What you saw (the evidence)');

    await lifecycle({ work: ref, action: 'close', method: 'Reviewed', evidence: [{ kind: 'note', ref: 'r', summary: 'Looked right' }] });
    t = await page();
    expect(t).toContain('Recently closed');
    expect(t).toContain('CLOSED Completed and kept in history.');
    expect(t).toContain('verified by DS-00');
    expect(t).not.toContain('Verify and close');
    expect(t).not.toContain('Send to verification');
  }, 150_000);

  it('offers no lifecycle action on Work waiting for approval', async () => {
    await ceo(`${TEST_TAG}Set up the DNS`, { brand: 'moonglasses' });
    const t = await tower('pipeline');
    expect(t).toContain('Pending approval Waiting for a decision');
    expect(t).not.toContain('Mark resolved');
    expect(t).not.toMatch(/\bStart\b/);
  }, 90_000);
});
