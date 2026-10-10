// The logic behind `npm run verify:ceo-live`, run against the real schema (0055 + 0056) in embedded Postgres.
// SCHEMA-VERIFIED only: this proves the checks work, not that the live Supabase project passes them.
import { describe, expect, it } from 'vitest';
import { createSupabaseWorkStore } from '../../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry } from '../../../src/lib/work/db-registry';
import { handleFounderInput } from '../../../src/lib/ceo/founder-service';
import { Scopes } from '../../../src/lib/work/scope';
import { advanceWork } from '../../../src/lib/work/lifecycle-service';
import { VIRAT } from '../../../src/lib/work/actors';
import { runLiveVerification, closeLeftoverTestRecords, asFounderResult, type Ask } from '../../../scripts/verify/ceo-live-run';
import { DEV } from './helpers';
import { freshDb, pgClient } from './pg-client';

const pw = 'pw';
const auth = (p: string) => 'Basic ' + Buffer.from(`admin:${p}`).toString('base64');

async function setup() {
  const db = await freshDb();
  const store = createSupabaseWorkStore(pgClient(db) as never);
  const ask: Ask = async (text, o = {}) => asFounderResult(await handleFounderInput(auth(o.authorised === false ? 'wrong' : pw), { text, work_id: o.work_id }, { store, adminPassword: pw }));
  return { db, store, ask };
}

describe('runLiveVerification', () => {
  it('passes every check, closes only its own [IT-LIVE] records and leaves other Work untouched', async () => {
    const { store, ask } = await setup();
    let realId = '';
    await mutateRegistry(store, (reg) => { const c = reg.createItem({ title: 'Real customer work', type: 'task', scope: Scopes.brand('moonglasses') }, DEV); if (!c.ok) throw new Error('seed'); realId = c.value.id; return { value: null, changed: true }; });
    const report = await runLiveVerification(store, ask);
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.created.length).toBe(3);
    expect(report.closed).toBe(true);

    const reg = await loadRegistry(store);
    expect(report.created.every((id) => reg.get(id)!.state === 'closed' && reg.get(id)!.title.startsWith('[IT-LIVE]'))).toBe(true);
    expect(reg.get(realId)!.state).toBe('new');
    expect(reg.get(realId)!.events.length).toBe(1);
    expect(reg.list().length).toBe(4);
    expect(reg.list().every((i) => reg.verifyAudit(i.id).ok)).toBe(true);
  });

  it('CEO_LIVE_KEEP_OPEN leaves the records open, and a second run refuses until they are closed', async () => {
    const { store, ask } = await setup();
    const first = await runLiveVerification(store, ask, { keepOpen: true });
    expect(first.ok).toBe(true);
    expect(first.closed).toBe(false);
    const reg = await loadRegistry(store);
    expect(first.created.every((id) => reg.get(id)!.state !== 'closed')).toBe(true);

    const second = await runLiveVerification(store, ask);
    expect(second.ok).toBe(false);
    expect(second.checks[0].name).toMatch(/no open \[IT-LIVE\] records/);
    expect((await loadRegistry(store)).list().length).toBe(3);

    for (const id of first.created) await advanceWork(store, { work: id, action: 'close_test_record', by: VIRAT });
    expect((await runLiveVerification(store, ask)).ok).toBe(true);
  });

  it('closes leftover [IT-LIVE] records through the lifecycle and nothing else', async () => {
    const { store, ask } = await setup();
    let realId = '';
    await mutateRegistry(store, (reg) => { const c = reg.createItem({ title: 'Real customer work', type: 'task', scope: Scopes.devshop() }, DEV); if (!c.ok) throw new Error('seed'); realId = c.value.id; return { value: null, changed: true }; });
    const left = await runLiveVerification(store, ask, { keepOpen: true });
    const out = await closeLeftoverTestRecords(store);
    expect(out.failed).toEqual([]);
    expect(out.closed.length).toBe(3);
    const reg = await loadRegistry(store);
    expect(left.created.every((id) => reg.get(id)!.state === 'closed' && reg.get(id)!.title.startsWith('[IT-LIVE]'))).toBe(true);
    expect(reg.get(realId)!.state).toBe('new');
    expect(reg.list().length).toBe(4);
    expect((await closeLeftoverTestRecords(store)).closed).toEqual([]);
  });

  it('never assigns the technical deployment holder', async () => {
    const { store, ask } = await setup();
    await runLiveVerification(store, ask);
    const reg = await loadRegistry(store);
    for (const i of reg.list()) expect([i.owner, ...i.supporting].some((a) => a?.id === 'P-01')).toBe(false);
  });
});
