// Moving Work through the later lifecycle, server side: start, resolve, verify, close. The rules are the
// contract's (lifecycle.ts): RESOLVED is not CLOSED, closing needs verification and evidence, a P0/P1 item is
// verified by someone other than who resolved it. This service only calls them and persists the result in ONE
// atomic write. An illegal move returns a typed error and writes nothing. History is never removed.

import type { WorkStore } from './db-store';
import { mutateRegistry } from './db-registry';
import type { InMemoryWorkRegistry } from './registry';
import { isVirat } from './actors';
import type { Actor, EvidenceInput, ResolutionKind, Result, WorkItem } from './types';
import { fail, ok } from './types';

export type LifecycleAction = 'start' | 'resolve' | 'verify' | 'close' | 'close_test_record';

export interface LifecycleRequest {
  /** The Work id, or its W-#### reference. */
  work: string;
  action: LifecycleAction;
  by: Actor;
  summary?: string;
  resolutionKind?: ResolutionKind;
  method?: string;
  evidence?: EvidenceInput[];
}

/** Titles that mark deliberately created test records. Only these can be closed in one step. */
export const TEST_RECORD_MARKERS = ['[IT-LIVE]', '[IT-TEST]'] as const;
export const isTestRecord = (title: string): boolean => TEST_RECORD_MARKERS.some((m) => title.startsWith(m));

function run(reg: InMemoryWorkRegistry, req: LifecycleRequest): Result<WorkItem> {
  if (!isVirat(req.by)) return fail('not_permitted', 'lifecycle actions through this service are the Founder\'s');
  const item = reg.list().find((i) => i.id === req.work || i.ref === req.work);
  if (!item) return fail('not_found', `no Work with reference "${req.work}"`);
  const id = item.id;

  switch (req.action) {
    case 'start':
      return reg.transition(id, 'in_progress', req.by, { reason: req.summary ?? 'started' });
    case 'resolve':
      if (!req.summary?.trim()) return fail('resolution_required', 'say what was done');
      return reg.transition(id, 'resolved', req.by, { payload: { resolution: { kind: req.resolutionKind ?? 'completed', summary: req.summary } } });
    case 'verify':
      return reg.transition(id, 'verification', req.by, { reason: req.summary ?? 'verification started' });
    case 'close':
      return reg.transition(id, 'closed', req.by, { payload: { closure: { method: req.method ?? '', evidence: req.evidence ?? [] } } });
    case 'close_test_record': {
      if (!isTestRecord(item.title)) return fail('not_permitted', `only Work whose title starts with ${TEST_RECORD_MARKERS.join(' or ')} can be closed this way`);
      const owner = item.owner;
      // The steps before verification are recorded against the owner only when the owner is an agent. A human owner
      // is never shown as having done work they did not do: the Founder performs those steps and says so.
      const doer: Actor | null = owner ? (owner.kind === 'agent' ? owner : req.by) : null;
      const why = 'closing a verification record on the Founder\'s instruction';
      const steps: ((r: InMemoryWorkRegistry) => Result<WorkItem>)[] = [];
      if (item.state === 'assigned') {
        if (!doer) return fail('owner_required', 'the item has no accountable owner');
        steps.push((r) => r.transition(id, 'in_progress', doer, { reason: why }));
      }
      if (item.state === 'assigned' || item.state === 'in_progress') {
        if (!doer) return fail('owner_required', 'the item has no accountable owner');
        steps.push((r) => r.transition(id, 'resolved', doer, { reason: why, payload: { resolution: { kind: 'completed', summary: 'Verification record: its purpose is served. Closed, not deleted; history retained.' } } }));
      }
      if (item.state === 'assigned' || item.state === 'in_progress' || item.state === 'resolved') {
        steps.push((r) => r.transition(id, 'verification', req.by, { reason: 'Founder verifies the record' }));
      }
      if (!steps.length && item.state !== 'verification') {
        return fail('illegal_transition', `a test record in ${item.state} cannot be closed in one step; it must be assigned, in progress, resolved or in verification`);
      }
      steps.push((r) => r.transition(id, 'closed', req.by, { payload: { closure: {
        method: req.method?.trim() || 'Founder review of the verification run',
        evidence: req.evidence?.length ? req.evidence : [{ kind: 'note', ref: 'founder-close', summary: 'Founder closed this test record. No deletion; the full audit trail is retained.' }],
      } } }));
      let last: Result<WorkItem> = ok(item);
      for (const step of steps) { last = step(reg); if (!last.ok) return last; }
      return last;
    }
  }
}

/** One logical lifecycle operation, persisted atomically (all its transitions commit together or none do). */
export async function advanceWork(store: WorkStore, req: LifecycleRequest): Promise<Result<WorkItem>> {
  return mutateRegistry(store, (reg) => { const r = run(reg, req); return { value: r, changed: r.ok }; });
}
