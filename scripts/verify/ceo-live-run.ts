// The checks behind `npm run verify:ceo-live`, separate from its guards so the logic can be tested against a
// local database before anyone points it at the real project. Every record it creates is titled "[IT-LIVE] ...",
// has no brand, and is closed (not deleted) at the end through the lifecycle. Nothing is sent anywhere.

import type { WorkStore } from '../../src/lib/work/db-store';
import { loadRegistry, mutateRegistry } from '../../src/lib/work/db-registry';
import { buildControlTowerView } from '../../src/lib/control-tower/view';
import { advanceWork } from '../../src/lib/work/lifecycle-service';
import { VIRAT } from '../../src/lib/work/actors';
import type { FounderResult } from '../../src/lib/ceo/founder-service';

export type Ask = (text: string, opts?: { work_id?: string; authorised?: boolean }) => Promise<{ status: number; body: any }>;
export interface Check { name: string; ok: boolean; detail?: string }
export interface LiveReport { checks: Check[]; created: string[]; closed: boolean; ok: boolean }

export const MARK = '[IT-LIVE]';

/** Close every open [IT-LIVE] record left by an earlier run, through the lifecycle (never a delete). Nothing else is touched. */
export async function closeLeftoverTestRecords(store: WorkStore): Promise<{ closed: string[]; failed: { ref: string; why: string }[] }> {
  const reg = await loadRegistry(store);
  const open = reg.list().filter((i) => i.title.startsWith(MARK) && i.state !== 'closed');
  const closed: string[] = []; const failed: { ref: string; why: string }[] = [];
  for (const item of open) {
    const r = await advanceWork(store, { work: item.id, action: 'close_test_record', by: VIRAT, method: 'verify:ceo-live closed a record left by an earlier run' });
    if (r.ok) closed.push(item.ref); else failed.push({ ref: item.ref, why: `${r.error.code}: ${r.error.message}` });
  }
  return { closed, failed };
}

export async function runLiveVerification(store: WorkStore, ask: Ask, opts: { keepOpen?: boolean } = {}): Promise<LiveReport> {
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); return ok; };
  const created: string[] = [];
  const snap = async () => { const r = await loadRegistry(store); return { r, items: r.list().length, events: r.list().reduce((n, i) => n + i.events.length, 0) }; };

  // 0. Start clean: leftover open test records would be matched by the duplicate check.
  const start = await snap();
  const leftovers = start.r.list().filter((i) => i.title.startsWith(MARK) && i.state !== 'closed');
  if (!check('no open [IT-LIVE] records are left from an earlier run', leftovers.length === 0, leftovers.map((i) => i.ref).join(', '))) {
    return { checks, created, closed: false, ok: false };
  }

  // 1. A status question writes nothing.
  let before = await snap();
  const q = await ask('What needs my attention this morning?');
  let after = await snap();
  check('a status question writes nothing', q.status === 200 && q.body.write === null && after.events === before.events && after.items === before.items);

  // 2. Unauthorised input writes nothing.
  before = await snap();
  const bad = await ask(`${MARK} Redesign the homepage banner`, { authorised: false });
  after = await snap();
  check('unauthorised input is refused and writes nothing', bad.status === 401 && after.events === before.events && after.items === before.items);

  // 3. Real creation, through the CEO runtime.
  const a = await ask(`${MARK} Redesign the homepage banner`);
  const aId: string | undefined = a.body?.work?.id;
  if (aId) created.push(aId);
  check('a request creates Work through the CEO runtime', a.status === 200 && a.body.outcome.kind === 'work_created' && a.body.write?.operation === 'create_work', a.body?.outcome?.summary);

  // 4. The same request again reuses it.
  const dup = await ask(`${MARK} Redesign the homepage banner`);
  check('a duplicate request reuses the same Work', dup.status === 200 && dup.body.outcome.kind === 'work_updated' && dup.body.work?.id === aId);

  // 5. A weak match is not attached.
  const b = await ask(`${MARK} Add a banner to the checkout`);
  const bId: string | undefined = b.body?.work?.id;
  if (bId && bId !== aId) created.push(bId);
  check('a weak match is not attached; a new Work is created and the similar one is listed', b.status === 200 && b.body.outcome.kind === 'work_created' && bId !== aId && (b.body.similarWork ?? []).length >= 1);

  // 6. An explicit Work reference attaches evidence to exactly that Work.
  const ev = await ask('Here is the screenshot', { work_id: aId });
  const afterEv = await loadRegistry(store);
  check('an explicit Work reference attaches evidence to that Work only', ev.status === 200 && ev.body.outcome.kind === 'evidence_attached'
    && (afterEv.get(aId!)?.evidence.length ?? 0) === 1 && (afterEv.get(bId!)?.evidence.length ?? 0) === 0);

  // 7. Technical deployment: routed to the role, held for Virat's approval, Prince not assigned.
  const c = await ask(`${MARK} Set up the DNS`);
  const cId: string | undefined = c.body?.work?.id;
  if (cId) created.push(cId);
  const cItem = cId ? (await loadRegistry(store)).get(cId) : undefined;
  check('technical deployment routes to the technical_deployment_officer role, current holder Prince Keshri',
    c.body?.routing?.role === 'technical_deployment_officer' && JSON.stringify(c.body.routing.currentHolders) === JSON.stringify(['Prince Keshri']));
  check('Virat approval is required first: pending, owned by DS-02, Prince not assigned',
    cItem?.state === 'pending_approval' && cItem.approval?.requested_from === 'virat' && cItem.approval.authority === 'prince_assignment' && cItem.owner?.id === 'DS-02' && ![cItem.owner, ...cItem.supporting].some((x) => x?.id === 'P-01'));

  // 8. A decision on that approval persists with its audit event. Rejected, so no real person is assigned work.
  if (cId) {
    const d = await mutateRegistry(store, (reg) => { const r = reg.decideApproval(cId, 'rejected', VIRAT, `${MARK} test record: the gate is proven; no assignment is wanted`); return { value: r, changed: r.ok }; });
    const dItem = (await loadRegistry(store)).get(cId);
    check('an approval decision persists with its audit event and returns the Work to its owner, unassigned to Prince',
      d.ok && dItem?.approval?.decision?.outcome === 'rejected' && dItem.events.some((e) => e.kind === 'approval_decided') && dItem.owner?.id === 'DS-02');
  }

  // 9. Read-back: audit chains, Control Tower visibility.
  let reg = await loadRegistry(store);
  const open = Object.values(buildControlTowerView(reg).byStage).flat().map((w) => w.id);
  check('every created record reads back, its audit chain verifies and the Control Tower shows it',
    created.length === 3 && created.every((id) => reg.get(id) && reg.verifyAudit(id).ok && open.includes(id)));
  const eventsBeforeClose = new Map(created.map((id) => [id, reg.get(id)!.events.map((e) => e.hash)]));

  // 10. Lifecycle: resolve, verify, close. Never deleted. Only [IT-LIVE] records.
  let closed = false;
  if (!opts.keepOpen) {
    let allOk = true;
    for (const id of created) {
      const item = reg.get(id)!;
      if (!item.title.startsWith(MARK)) { allOk = false; continue; }
      const r = await advanceWork(store, { work: id, action: 'close_test_record', by: VIRAT, method: 'verify:ceo-live read back the record, its audit chain and its Control Tower visibility' });
      if (!r.ok) { check(`closing ${item.ref}`, false, `${r.error.code}: ${r.error.message}`); allOk = false; }
    }
    reg = await loadRegistry(store);
    const everyClosed = created.every((id) => reg.get(id)?.state === 'closed' && reg.get(id)!.closure?.verified_by.id === 'DS-00');
    const historyKept = created.every((id) => { const old = eventsBeforeClose.get(id)!; const now = reg.get(id)!.events; return now.length > old.length && old.every((h, i) => now[i].hash === h); });
    const stillThere = created.every((id) => Object.values(buildControlTowerView(reg, { includeAll: true }).byStage).flat().some((w) => w.id === id));
    const chains = created.every((id) => reg.verifyAudit(id).ok);
    const titlesKept = created.every((id) => reg.get(id)!.title.startsWith(MARK));
    closed = check('resolve, verify, close: all closed, history retained, nothing deleted, chains valid, markers kept',
      allOk && everyClosed && historyKept && stillThere && chains && titlesKept);
    check('no other Work was touched', reg.list().filter((i) => !created.includes(i.id)).every((i) => start.r.get(i.id) && start.r.get(i.id)!.events.length === i.events.length));
  }

  return { checks, created, closed, ok: checks.every((x) => x.ok) };
}

export const asFounderResult = (r: FounderResult) => ({ status: r.status, body: r.body as any });
