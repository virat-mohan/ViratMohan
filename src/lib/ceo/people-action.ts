// People OS task actions: accept work, update progress, record blockers, submit completion.
// Workers (Prince) can act on their OWN assigned work through the Work Registry lifecycle.
// This is the worker-facing complement to the Founder's lifecycle-service.ts.

import type { WorkStore } from '../work/db-store';
import { mutateRegistry } from '../work/db-registry';
import type { InMemoryWorkRegistry } from '../work/registry';
import type { Actor, EvidenceInput, Result, WorkItem } from '../work/types';
import { fail, ok } from '../work/types';
import { findWorker, workerAsActor } from './people';

export type WorkerAction = 'accept' | 'start' | 'update_progress' | 'record_blocker' | 'clear_blocker' | 'submit_completion';

export interface WorkerActionRequest {
  worker_id: string;
  work_id: string;
  action: WorkerAction;
  note?: string;
  blocker_reason?: string;
  evidence?: EvidenceInput[];
}

function normalizeId(id: string): string {
  return id.toLowerCase().replace('-', '_');
}

function isOwnWork(item: WorkItem, actor: Actor): boolean {
  return !!item.owner && item.owner.kind === actor.kind && normalizeId(item.owner.id) === normalizeId(actor.id);
}

function run(reg: InMemoryWorkRegistry, req: WorkerActionRequest): Result<WorkItem> {
  const worker = findWorker(req.worker_id);
  if (!worker) return fail('not_found', `unknown worker "${req.worker_id}"`);
  const actor = workerAsActor(worker);

  const item = reg.list().find((i) => i.id === req.work_id || i.ref === req.work_id);
  if (!item) return fail('not_found', `no Work with reference "${req.work_id}"`);
  if (!isOwnWork(item, actor)) return fail('not_permitted', 'workers can only act on their own assigned work');

  const id = item.id;

  switch (req.action) {
    case 'accept':
      if (item.state !== 'assigned') return fail('illegal_transition', `can only accept work in "assigned" state, not "${item.state}"`);
      return reg.transition(id, 'in_progress', actor, { reason: req.note ?? 'accepted by worker' });

    case 'start':
      if (item.state === 'assigned') return reg.transition(id, 'in_progress', actor, { reason: req.note ?? 'started' });
      return fail('illegal_transition', `can only start work in "assigned" state, not "${item.state}"`);

    case 'update_progress': {
      if (item.state !== 'in_progress') return fail('illegal_transition', 'progress updates apply to in-progress work');
      if (!req.note?.trim()) return fail('invalid_input', 'a progress update needs a note');
      const evResult = reg.addEvidence(id, { kind: 'note', ref: 'progress-update', summary: req.note.trim() }, actor);
      if (!evResult.ok) return evResult as unknown as Result<WorkItem>;
      const updated = reg.get(id);
      return updated ? ok(updated) : fail('not_found', 'item disappeared after adding evidence');
    }

    case 'record_blocker':
      if (item.state !== 'in_progress') return fail('illegal_transition', 'blockers apply to in-progress work');
      return reg.transition(id, 'blocked', actor, {
        reason: req.blocker_reason ?? req.note ?? 'blocked',
        payload: { blocked: { reason: req.blocker_reason ?? req.note ?? null } },
      });

    case 'clear_blocker':
      if (item.state !== 'blocked') return fail('illegal_transition', 'can only clear a blocker on blocked work');
      return reg.transition(id, 'in_progress', actor, { reason: req.note ?? 'blocker cleared' });

    case 'submit_completion':
      if (item.state !== 'in_progress') return fail('illegal_transition', 'completion applies to in-progress work');
      if (!req.note?.trim()) return fail('invalid_input', 'completion needs a summary');
      return reg.transition(id, 'resolved', actor, {
        payload: { resolution: { kind: 'completed', summary: req.note.trim() } },
      });
  }
}

export async function handleWorkerAction(store: WorkStore, req: WorkerActionRequest): Promise<Result<WorkItem>> {
  return mutateRegistry(store, (reg) => { const r = run(reg, req); return { value: r, changed: r.ok }; });
}
