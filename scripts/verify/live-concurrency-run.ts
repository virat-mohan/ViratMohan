// The checks behind `npm run verify:live-concurrency`, separate from its guards so the logic is tested against a local
// database before anyone points it at the real project. Every record is titled "[IT-LIVE] ... <run id>", locks use a
// sandbox repository name, and everything is closed (never deleted) through the lifecycle at the end. Assertions only
// look at this run's records, because real activity can change a live registry while this runs.
// Two writers are two simultaneous persists, each its own work_persist transaction.
import { WorkConflictError } from '../../src/lib/work/db-store';
import type { WorkStore } from '../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry, persistBaseline } from '../../src/lib/work/db-registry';
import { Scopes } from '../../src/lib/work/scope';
import type { Actor } from '../../src/lib/work/types';
import { closeTestRecord } from './ceo-live-run';

export interface ConcurrencyReport { run: string; checks: { name: string; ok: boolean; detail?: string }[]; ok: boolean }
/** Number of rows in a registry table whose column matches a SQL LIKE pattern. */
export type CountWhere = (table: string, column: string, like: string) => Promise<number>;

const DEV: Actor = { kind: 'agent', id: 'DS-02' };
type Reg = Awaited<ReturnType<typeof loadRegistry>>;

export async function runConcurrencyVerification(storeA: WorkStore, storeB: WorkStore, countWhere: CountWhere, runId = `r${Date.now().toString(36)}`): Promise<ConcurrencyReport> {
  const run = runId;
  const T = (s: string) => `[IT-LIVE] ${s} ${run}`;
  const SANDBOX = { repository: `it-live-sandbox-${run}`, branch: 'main', worktree: null, paths: [], deployment_target: null, material: true };
  const checks: ConcurrencyReport['checks'] = [];
  const check = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); return ok; };
  const settle = async <A, B>(a: Promise<A>, b: Promise<B>) => { const [x, y] = await Promise.allSettled([a, b]); return [x, y] as const; };
  const isConflict = (r: PromiseSettledResult<unknown>) => r.status === 'rejected' && r.reason instanceof WorkConflictError;
  const wins = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r) => r.status === 'fulfilled').length;
  const mine = (reg: Reg) => reg.list().filter((i) => i.title.includes(` ${run}`));
  const chainsOk = (reg: Reg) => mine(reg).every((i) => reg.verifyAudit(i.id).ok);
  const sandboxLocks = (reg: Reg) => reg.activeLocks().filter((l) => l.repository === SANDBOX.repository);

  // A lock gives its item a material scope, and a material item cannot be started without a lock. So the two items that
  // will take a lock are started first; closing them later then never needs the lock that was released.
  function owned(reg: Reg, title: string, start = false): string {
    const r = reg.createItem({ title, type: 'task', scope: Scopes.devshop() }, DEV);
    if (!r.ok) throw new Error(`create: ${r.error.message}`);
    const id = r.value.id;
    const t = reg.transition(id, 'triaged', DEV, { payload: { triage: { type: 'task', priority: 'P4', priority_reason: 'live verification record', scope: Scopes.devshop() } } });
    const a = reg.transition(id, 'assigned', DEV, { payload: { owner: DEV } });
    if (!t.ok || !a.ok) throw new Error('triage/assign failed');
    if (start) { const s = reg.transition(id, 'in_progress', DEV, { reason: 'live verification record' }); if (!s.ok) throw new Error('start failed'); }
    return id;
  }

  try {
    const [x, y, p, q] = await mutateRegistry(storeA, (reg) => ({ value: [['X', false], ['Y', false], ['P', true], ['Q', true]].map(([n, s]) => owned(reg, T(`concurrency ${n}`), s as boolean)), changed: true }));

    // 1. Same Work, two writers at once: exactly one lands, the other is a conflict, no lost update.
    {
      const A = await loadRegistry(storeA); const bA = persistBaseline(A);
      const B = await loadRegistry(storeB); const bB = persistBaseline(B);
      A.addEvidence(x, { kind: 'note', ref: 'a', summary: 'writer A' }, DEV);
      B.addEvidence(x, { kind: 'note', ref: 'b', summary: 'writer B' }, DEV);
      const rs = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
      const after = await loadRegistry(storeA);
      const refs = after.get(x)!.evidence.map((e) => e.ref);
      check('same Work, concurrent updates: exactly one commits, the other is a WorkConflictError', wins([...rs]) === 1 && [...rs].filter(isConflict).length === 1, rs.map((r) => (r.status === 'rejected' ? String(r.reason?.message).slice(0, 80) : 'ok')).join(' | '));
      check('same Work: only the winner\'s change is stored, audit chain valid', refs.length === 1 && chainsOk(after), refs.join(','));
    }

    // 2. Different Work, two writers at once: both land.
    {
      const A = await loadRegistry(storeA); const bA = persistBaseline(A);
      const B = await loadRegistry(storeB); const bB = persistBaseline(B);
      A.addEvidence(x, { kind: 'note', ref: 'a2', summary: 'A on X' }, DEV);
      B.addEvidence(y, { kind: 'note', ref: 'b2', summary: 'B on Y' }, DEV);
      const rs = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
      const after = await loadRegistry(storeA);
      check('different Work, concurrent updates: both commit', wins([...rs]) === 2, rs.map((r) => (r.status === 'rejected' ? String(r.reason?.message).slice(0, 80) : 'ok')).join(' | '));
      check('different Work: both changes stored, chains valid', after.get(x)!.evidence.some((e) => e.ref === 'a2') && after.get(y)!.evidence.some((e) => e.ref === 'b2') && chainsOk(after));
    }

    // 3. Source-event race and duplicate source event.
    {
      const report = { channel: 'system_alert' as const, external_ref: `it-live-${run}`, reporter: { kind: 'system' as const, id: 'system:health' }, title: T('race probe'), summary: 'live verification' };
      const A = await loadRegistry(storeA); const bA = persistBaseline(A);
      const B = await loadRegistry(storeB); const bB = persistBaseline(B);
      A.ingestSourceEvent(report); B.ingestSourceEvent(report);
      const rs = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
      check('source-event race: exactly one commits, the other is a WorkConflictError', wins([...rs]) === 1 && [...rs].filter(isConflict).length === 1, rs.map((r) => (r.status === 'rejected' ? String(r.reason?.message).slice(0, 80) : 'ok')).join(' | '));
      check('source-event race: one source event and one item exist for the report', (await countWhere('work_source_events', 'external_ref', report.external_ref)) === 1 && (await countWhere('work_items', 'title', `%race probe ${run}`)) === 1);
      const retry = await mutateRegistry(storeA, (r) => { const o = r.ingestSourceEvent(report); return { value: o, changed: o.ok && o.value.outcome !== 'duplicate_event' }; });
      check('duplicate source event: the retry dedupes and writes nothing', retry.ok && retry.value.outcome === 'duplicate_event' && (await countWhere('work_source_events', 'external_ref', report.external_ref)) === 1);
    }

    // 4. Repo-lock race on a sandbox repository: exactly one lock, the loser writes nothing.
    {
      const A = await loadRegistry(storeA); const bA = persistBaseline(A);
      const B = await loadRegistry(storeB); const bB = persistBaseline(B);
      const la = A.acquireLock(p, SANDBOX as never, DEV); const lb = B.acquireLock(q, SANDBOX as never, DEV);
      const rs = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
      const after = await loadRegistry(storeA);
      const active = sandboxLocks(after);
      check('repo-lock race: exactly one commits, the other is a WorkConflictError', la.ok && lb.ok && wins([...rs]) === 1 && [...rs].filter(isConflict).length === 1, rs.map((r) => (r.status === 'rejected' ? String(r.reason?.message).slice(0, 80) : 'ok')).join(' | '));
      check('repo-lock race: exactly one active lock; the loser has no lock event', active.length === 1 && [p, q].filter((id) => after.get(id)!.events.some((e) => e.kind === 'lock_acquired')).length === 1 && chainsOk(after), `active=${active.length}`);
      for (const l of active) await mutateRegistry(storeA, (r) => { const res = r.releaseLock(l.id, DEV, 'live verification finished'); return { value: res, changed: res.ok }; });
      check('repo-lock race: the sandbox lock was released', sandboxLocks(await loadRegistry(storeA)).length === 0);
    }

    // 5. Link race: one link between X and Y.
    {
      const A = await loadRegistry(storeA); const bA = persistBaseline(A);
      const B = await loadRegistry(storeB); const bB = persistBaseline(B);
      const da = A.addDependency(x, y, DEV); const db = B.addDependency(x, y, DEV);
      const rs = await settle(storeA.persist(A.snapshot(), bA), storeB.persist(B.snapshot(), bB));
      const after = await loadRegistry(storeA);
      const links = after.snapshot().links.filter((l) => l.from === x && l.to === y);
      check('link race: exactly one commits, the other is a WorkConflictError', da.ok && db.ok && wins([...rs]) === 1 && [...rs].filter(isConflict).length === 1, rs.map((r) => (r.status === 'rejected' ? String(r.reason?.message).slice(0, 80) : 'ok')).join(' | '));
      check('link race: exactly one link, chains valid', links.length === 1 && chainsOk(after), `links=${links.length}`);
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
      check('stale writer: refused with a WorkConflictError', n.ok && stale instanceof WorkConflictError, String(stale?.message ?? 'not refused').slice(0, 80));
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
      check('rollback: the failing write was rejected', !!failed, String(failed?.message ?? 'it was not rejected').slice(0, 80));
      check('rollback: no partial Work row, events, source event, lock or link remained', (await countWhere('work_items', 'title', `%rollback probe ${run}`)) === 0
        && (await countWhere('work_source_events', 'external_ref', `it-live-${run}`)) === 1 && sandboxLocks(after).length === 0 && chainsOk(after));
    }
  } catch (e) {
    check('run completed without an unexpected error', false, e instanceof Error ? e.message : String(e));
  }

  // Cleanup always runs: resolve, verify, close this run's records. Never a delete.
  try {
    const open = mine(await loadRegistry(storeA)).filter((i) => i.state !== 'closed');
    const failed: string[] = [];
    for (const i of open) {
      const r = await closeTestRecord(storeA, i.id, 'verify:live-concurrency closed its own record');
      if (!r.ok) failed.push(`${i.ref}: ${r.error.code}`);
    }
    const after = await loadRegistry(storeA);
    check('every record from this run was closed through the lifecycle, none deleted, chains valid', failed.length === 0 && mine(after).length > 0 && mine(after).every((i) => i.state === 'closed') && chainsOk(after), failed.join(', '));
  } catch (e) { check('cleanup', false, e instanceof Error ? e.message : String(e)); }

  return { run, checks, ok: checks.every((c) => c.ok) };
}
