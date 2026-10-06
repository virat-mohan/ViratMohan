// Opt-in live concurrency and rollback check against the real control-plane Work Registry.
// Run:  CEO_LIVE_VERIFY=yes SUPABASE_URL=https://vszjwgxvqoqyixpfthwl.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run verify:live-concurrency
// Exit codes: 0 verified, 1 ran and failed, 2 not run. Same guards as verify:ceo-live. No brand database is touched.
// Two writers are two simultaneous requests, each its own work_persist transaction through PostgREST (pooled connections),
// from two separate clients. Every record is titled "[IT-LIVE] ... <run id>", locks use a sandbox repository name, and
// everything is closed (never deleted) through the lifecycle at the end. Assertions only look at this run's records,
// because real activity can change the live registry while this runs.
import { createClient } from '@supabase/supabase-js';
import { createSupabaseWorkStore, WorkConflictError } from '../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry, persistBaseline } from '../../src/lib/work/db-registry';
import { advanceWork } from '../../src/lib/work/lifecycle-service';
import { VIRAT } from '../../src/lib/work/actors';
import { Scopes } from '../../src/lib/work/scope';
import type { Actor } from '../../src/lib/work/types';

const { CEO_LIVE_VERIFY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const CONTROL_PLANE_REF = 'vszjwgxvqoqyixpfthwl';
const refuse = (why: string): never => { console.error(`NOT RUN: ${why} Nothing was written.`); process.exit(2); };
if (CEO_LIVE_VERIFY !== 'yes') refuse('set CEO_LIVE_VERIFY=yes to run this deliberately.');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) refuse('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!SUPABASE_URL!.includes(CONTROL_PLANE_REF)) refuse(`SUPABASE_URL is not the control-plane project (${CONTROL_PLANE_REF}); brand databases are never touched.`);

const client = () => createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const sbRead = client();
const storeA = createSupabaseWorkStore(client());
const storeB = createSupabaseWorkStore(client());
const DEV: Actor = { kind: 'agent', id: 'DS-02' };
const run = `r${Date.now().toString(36)}`;
const T = (s: string) => `[IT-LIVE] ${s} ${run}`;
const SANDBOX = { repository: `it-live-sandbox-${run}`, branch: 'main', worktree: null, paths: [], deployment_target: null, material: true };

const checks: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); return ok; };
const settle = async <A, B>(a: Promise<A>, b: Promise<B>) => { const [x, y] = await Promise.allSettled([a, b]); return [x, y] as const; };
const isConflict = (r: PromiseSettledResult<unknown>) => r.status === 'rejected' && r.reason instanceof WorkConflictError;
const countWhere = async (table: string, col: string, like: string) => {
  const { count, error } = await sbRead.from(table).select('*', { count: 'exact', head: true }).like(col, like);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
};
type Reg = Awaited<ReturnType<typeof loadRegistry>>;
const mine = (reg: Reg) => reg.list().filter((i) => i.title.includes(` ${run}`));
const chainsOk = (reg: Reg) => mine(reg).every((i) => reg.verifyAudit(i.id).ok);

function owned(reg: Reg, title: string): string {
  const r = reg.createItem({ title, type: 'task', scope: Scopes.devshop() }, DEV);
  if (!r.ok) throw new Error(`create: ${r.error.message}`);
  const id = r.value.id;
  const t = reg.transition(id, 'triaged', DEV, { payload: { triage: { type: 'task', priority: 'P4', priority_reason: 'live verification record', scope: Scopes.devshop() } } });
  const a = reg.transition(id, 'assigned', DEV, { payload: { owner: DEV } });
  if (!t.ok || !a.ok) throw new Error('triage/assign failed');
  return id;
}

async function main() {
  // Setup: four owned records in one write.
  const ids = await mutateRegistry(storeA, (reg) => ({ value: ['X', 'Y', 'P', 'Q'].map((n) => owned(reg, T(`concurrency ${n}`))), changed: true }));
  const [x, y, p, q] = ids;

  // 1. Same Work, two writers at once: exactly one lands, the other is refused as a conflict, no lost update.
  {
    const A = await loadRegistry(storeA); const bA = persistBaseline(A);
    const B = await loadRegistry(storeB); const bB = persistBaseline(B);
    A.addEvidence(x, { kind: 'note', ref: 'a', summary: 'writer A' }, DEV);
    B.addEvidence(x, { kind: 'note', ref: 'b', summary: 'writer B' }, DEV);
    const [ra, rb] = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
    const after = await loadRegistry(storeA);
    const refs = after.get(x)!.evidence.map((e) => e.ref);
    check('same Work, concurrent updates: exactly one commits, the other is a WorkConflictError', [ra, rb].filter((r) => r.status === 'fulfilled').length === 1 && [ra, rb].filter(isConflict).length === 1);
    check('same Work: only the winner\'s change is stored, audit chain valid', refs.length === 1 && chainsOk(after), refs.join(','));
  }

  // 2. Different Work, two writers at once: both land.
  {
    const A = await loadRegistry(storeA); const bA = persistBaseline(A);
    const B = await loadRegistry(storeB); const bB = persistBaseline(B);
    A.addEvidence(x, { kind: 'note', ref: 'a2', summary: 'A on X' }, DEV);
    B.addEvidence(y, { kind: 'note', ref: 'b2', summary: 'B on Y' }, DEV);
    const [ra, rb] = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
    const after = await loadRegistry(storeA);
    check('different Work, concurrent updates: both commit', ra.status === 'fulfilled' && rb.status === 'fulfilled', [ra, rb].map((r) => (r.status === 'rejected' ? String(r.reason?.message) : 'ok')).join(' | '));
    check('different Work: both changes stored, chains valid', after.get(x)!.evidence.some((e) => e.ref === 'a2') && after.get(y)!.evidence.some((e) => e.ref === 'b2') && chainsOk(after));
  }

  // 3. Source-event race and duplicate source event.
  {
    const report = { channel: 'system_alert' as const, external_ref: `it-live-${run}`, reporter: { kind: 'system' as const, id: 'system:health' }, title: T('race probe'), summary: 'live verification' };
    const A = await loadRegistry(storeA); const bA = persistBaseline(A);
    const B = await loadRegistry(storeB); const bB = persistBaseline(B);
    A.ingestSourceEvent(report); B.ingestSourceEvent(report);
    const [ra, rb] = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
    check('source-event race: exactly one commits, the other is a WorkConflictError', [ra, rb].filter((r) => r.status === 'fulfilled').length === 1 && [ra, rb].filter(isConflict).length === 1);
    check('source-event race: one source event and one item exist for the report', (await countWhere('work_source_events', 'external_ref', report.external_ref)) === 1 && (await countWhere('work_items', 'title', `%race probe ${run}`)) === 1);
    const retry = await mutateRegistry(storeA, (r) => { const o = r.ingestSourceEvent(report); return { value: o, changed: o.ok && o.value.outcome !== 'duplicate_event' }; });
    check('duplicate source event: the retry dedupes and writes nothing', retry.ok && retry.value.outcome === 'duplicate_event' && (await countWhere('work_source_events', 'external_ref', report.external_ref)) === 1);
  }

  // 4. Repo-lock race on a sandbox repository: exactly one lock, the loser writes nothing.
  {
    const A = await loadRegistry(storeA); const bA = persistBaseline(A);
    const B = await loadRegistry(storeB); const bB = persistBaseline(B);
    const la = A.acquireLock(p, SANDBOX as never, DEV); const lb = B.acquireLock(q, SANDBOX as never, DEV);
    const [ra, rb] = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
    const after = await loadRegistry(storeA);
    const active = after.activeLocks().filter((l) => (l as { scope?: { repository?: string } }).scope?.repository === SANDBOX.repository);
    check('repo-lock race: exactly one commits, the other is a WorkConflictError', la.ok && lb.ok && [ra, rb].filter((r) => r.status === 'fulfilled').length === 1 && [ra, rb].filter(isConflict).length === 1);
    check('repo-lock race: exactly one active lock; the loser has no lock event', active.length === 1 && [p, q].filter((id) => after.get(id)!.events.some((e) => e.kind === 'lock_acquired')).length === 1 && chainsOk(after));
    for (const l of active) await mutateRegistry(storeA, (r) => { const res = r.releaseLock(l.id, DEV, 'live verification finished'); return { value: res, changed: res.ok }; });
    const released = await loadRegistry(storeA);
    check('repo-lock race: the sandbox lock was released', released.activeLocks().every((l) => (l as { scope?: { repository?: string } }).scope?.repository !== SANDBOX.repository));
  }

  // 5. Link race: one link between X and Y.
  {
    const A = await loadRegistry(storeA); const bA = persistBaseline(A);
    const B = await loadRegistry(storeB); const bB = persistBaseline(B);
    const da = A.addDependency(x, y, DEV); const db = B.addDependency(x, y, DEV);
    const [ra, rb] = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
    const after = await loadRegistry(storeA);
    const links = after.snapshot().links.filter((l) => l.from === x && l.to === y);
    check('link race: exactly one commits, the other is a WorkConflictError', da.ok && db.ok && [ra, rb].filter((r) => r.status === 'fulfilled').length === 1 && [ra, rb].filter(isConflict).length === 1);
    check('link race: exactly one link, chains valid', links.length === 1 && chainsOk(after));
  }

  // 6. Stale writer with a whole logical write: nothing of it lands, including a new item in the same write.
  {
    const A = await loadRegistry(storeA); const bA = persistBaseline(A);
    const B = await loadRegistry(storeB); const bB = persistBaseline(B);
    B.addEvidence(y, { kind: 'note', ref: 'fresh', summary: 'fresh writer' }, DEV);
    await storeB.persist(B.snapshot(), bB);
    A.addEvidence(y, { kind: 'note', ref: 'stale', summary: 'stale writer' }, DEV);
    const n = A.createItem({ title: T('stale writer new item'), type: 'task', scope: Scopes.devshop() }, DEV);
    const stale = await storeA.persist(A.snapshot(), bA).then(() => null, (e) => e);
    const after = await loadRegistry(storeA);
    check('stale writer: refused with a WorkConflictError', n.ok && stale instanceof WorkConflictError, String(stale?.message ?? 'not refused'));
    check('stale writer: none of its write landed (evidence and the new item are absent)', !after.get(y)!.evidence.some((e) => e.ref === 'stale') && (await countWhere('work_items', 'title', `%stale writer new item ${run}`)) === 0 && chainsOk(after));
  }

  // R. Rollback: a write that fails after earlier rows were accepted leaves no partial state.
  {
    const reg = await loadRegistry(storeA); const base = persistBaseline(reg);
    const existing = reg.snapshot().sourceEvents.find((e) => e.external_ref === `it-live-${run}`);
    const r = reg.createItem({ title: T('rollback probe'), type: 'task', scope: Scopes.devshop() }, DEV);
    if (!existing || !r.ok) throw new Error('rollback setup failed');
    const snap = reg.snapshot();
    const dup = { ...existing, id: crypto.randomUUID() };
    const failed = await storeA.persist({ ...snap, sourceEvents: [...snap.sourceEvents, dup] }, base).then(() => null, (e) => e);
    const after = await loadRegistry(storeA);
    check('rollback: the failing write was rejected', !!failed, String(failed?.message ?? 'it was not rejected'));
    check('rollback: no partial Work row, events, source event, lock or link remained', (await countWhere('work_items', 'title', `%rollback probe ${run}`)) === 0
      && (await countWhere('work_source_events', 'external_ref', `it-live-${run}`)) === 1
      && after.activeLocks().every((l) => (l as { scope?: { repository?: string } }).scope?.repository !== SANDBOX.repository) && chainsOk(after));
  }
}

let fatal: unknown = null;
try { await main(); } catch (e) { fatal = e; check('run completed without an unexpected error', false, e instanceof Error ? e.message : String(e)); }

// Cleanup always runs: close this run's records through the lifecycle (resolve, verify, close). Never a delete.
try {
  const reg = await loadRegistry(storeA);
  const open = mine(reg).filter((i) => i.state !== 'closed');
  const failed: string[] = [];
  for (const i of open) {
    const r = await advanceWork(storeA, { work: i.id, action: 'close_test_record', by: VIRAT, method: 'verify:live-concurrency closed its own record' });
    if (!r.ok) failed.push(`${i.ref}: ${r.error.code}`);
  }
  const after = await loadRegistry(storeA);
  check('every record from this run was closed through the lifecycle, none deleted, chains valid', failed.length === 0 && mine(after).every((i) => i.state === 'closed') && chainsOk(after), failed.join(', '));
} catch (e) { check('cleanup', false, e instanceof Error ? e.message : String(e)); }

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail && !c.ok ? `  [${c.detail}]` : ''}`);
const ok = checks.every((c) => c.ok) && !fatal;
console.log(JSON.stringify({ run, checks: checks.length, ok }));
process.exit(ok ? 0 : 1);
