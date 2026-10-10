import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { WorkStore } from '../work/db-store';
import { loadRegistry } from '../work/db-registry';
import { buildControlTowerView } from '../control-tower/view';
import { handleFounderInput } from './founder-service';

const PASSWORD = 'test-secret';
const AUTH = 'Basic ' + btoa(`admin:${PASSWORD}`);
const now = new Date('2026-10-05T09:00:00Z');

function memStore() {
  let snap: Awaited<ReturnType<WorkStore['loadAll']>> = { items: [], sourceEvents: [], links: [], locks: [] };
  let persists = 0;
  const store: WorkStore = {
    async loadAll() { return structuredClone(snap); },
    async persist(s) { snap = structuredClone(s); persists++; },
  };
  return { store, persists: () => persists };
}

const send = (store: WorkStore | null, body: unknown, auth: string | null = AUTH) =>
  handleFounderInput(auth, body as never, { store, adminPassword: PASSWORD, now });

describe('Founder interface: authentication', () => {
  it('rejects an unauthenticated request and touches nothing', async () => {
    const m = memStore();
    const r = await send(m.store, { text: 'Fix the Moon checkout', brand: 'moonglasses' }, null);
    assert.equal(r.status, 401);
    assert.equal(m.persists(), 0);
  });

  it('rejects a wrong password', async () => {
    const r = await send(memStore().store, { text: 'hi' }, 'Basic ' + btoa('admin:wrong'));
    assert.equal(r.status, 401);
  });

  it('fails closed when the admin password is not configured', async () => {
    const r = await handleFounderInput(AUTH, { text: 'hi' }, { store: memStore().store, adminPassword: undefined });
    assert.equal(r.status, 503);
  });

  it('accepts the authenticated Founder', async () => {
    const r = await send(memStore().store, { text: 'Thanks!' });
    assert.equal(r.status, 200);
  });
});

describe('Founder interface: input validation', () => {
  it('rejects empty, oversized and unknown-brand input', async () => {
    const { store } = memStore();
    assert.equal((await send(store, { text: '   ' })).status, 400);
    assert.equal((await send(store, { text: 'x'.repeat(2001) })).status, 400);
    assert.equal((await send(store, { text: 'Fix it', brand: 'not-a-brand' })).status, 400);
    assert.equal((await send(store, { text: 'Here is proof', work_id: 'missing' })).status, 400);
  });

  it('reports 503 when the registry is not configured', async () => {
    assert.equal((await send(null, { text: 'Fix it' })).status, 503);
  });
});

describe('Founder interface: CEO runtime over the real registry store', () => {
  it('context query does not write', async () => {
    const m = memStore();
    const r = await send(m.store, { text: 'What needs my attention this morning?' });
    assert.equal(r.status, 200);
    assert.equal(m.persists(), 0);
  });

  it('new work is persisted, then reused on repeat, and the Control Tower sees it', async () => {
    const m = memStore();
    const a = await send(m.store, { text: 'Fix the Moon checkout', brand: 'moonglasses' });
    const b = await send(m.store, { text: 'Fix the Moon checkout', brand: 'moonglasses' });
    assert.ok(a.status === 200 && b.status === 200);
    assert.equal(a.status === 200 && a.body.outcome.kind, 'work_created');
    assert.equal(b.status === 200 && b.body.outcome.reusedExistingWork, true);
    const reg = await loadRegistry(m.store);
    assert.equal(reg.list().length, 1);
    assert.equal(buildControlTowerView(reg).total, 1);
    assert.equal(a.status === 200 && a.body.work?.owner, 'MG-01');
  });

  it('technical deployment: approval gate, then the role holder', async () => {
    const m = memStore();
    const a = await send(m.store, { text: 'Set up the DNS for Moon', brand: 'moonglasses' });
    assert.ok(a.status === 200);
    if (a.status !== 200) return;
    assert.equal(a.body.work?.state, 'pending_approval');
    assert.equal(a.body.routing?.role, 'technical_deployment_officer');
    assert.deepEqual(a.body.routing?.currentHolders, ['Prince Keshri']);
    assert.equal(a.body.escalation.required, true);
    const b = await send(m.store, { text: 'Approved, go ahead' });
    assert.ok(b.status === 200);
    if (b.status !== 200) return;
    assert.equal(b.body.outcome.kind, 'approval_recorded');
    assert.equal(b.body.work?.owner, 'P-01');
  });

  it('every response carries the structured operating fields and an audit trail', async () => {
    const r = await send(memStore().store, { text: 'Fix the Moon checkout', brand: 'moonglasses' });
    assert.ok(r.status === 200);
    if (r.status !== 200) return;
    for (const k of ['understood', 'context', 'authority', 'outcome', 'work', 'routing', 'question', 'escalation', 'nextStep', 'audit'] as const) assert.ok(k in r.body, k);
    assert.ok(r.body.audit.some((l) => l.includes('Founder input')));
  });
});
