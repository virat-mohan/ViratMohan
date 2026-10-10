// The lifecycle, enforced.
//
//   NEW → TRIAGED → ASSIGNED → IN PROGRESS → (WAITING | BLOCKED | PENDING APPROVAL) → RESOLVED → VERIFICATION → CLOSED → REOPENED
//
// RESOLVED is not CLOSED: closing needs verification and evidence. An illegal move never throws and
// never changes anything: it returns a typed error and the item is untouched. Every accepted move
// appends an audit event (previous state, new state, actor, time, reason).

import type {
  Actor, EvidenceInput, Priority, PriorityFactors, ResolutionKind, Result, WorkItem, WorkState, WorkType,
} from './types';
import { PRIORITIES, RESOLUTION_KINDS, WORK_STATES, WORK_TYPES, fail, ok } from './types';
import type { Scope } from './types';
import { appendEvent } from './audit';
import { isLessUrgent, suggestPriority } from './priority';
import { validateOwner } from './ownership';
import { sameActor, type ActorDirectory } from './actors';
import { closeGaps, resolveGaps } from './incident';
import { validateScope } from './scope';

export const TRANSITIONS: Readonly<Record<WorkState, readonly WorkState[]>> = {
  new: ['triaged'],
  triaged: ['assigned', 'waiting', 'blocked', 'pending_approval'],
  assigned: ['in_progress', 'waiting', 'blocked', 'pending_approval'],
  in_progress: ['waiting', 'blocked', 'pending_approval', 'resolved'],
  waiting: [], blocked: [], pending_approval: [], // holds resume to where they came from (see legalTargets)
  resolved: ['verification', 'reopened'],
  verification: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['triaged', 'assigned', 'in_progress'],
};

export const HOLD_STATES: readonly WorkState[] = ['waiting', 'blocked', 'pending_approval'];

/** Where an item may go next, given where it is (holds resume to where they were held from). */
export function legalTargets(item: Pick<WorkItem, 'state' | 'held_from' | 'owner' | 'approval'>): WorkState[] {
  if (HOLD_STATES.includes(item.state)) {
    const t = new Set<WorkState>();
    if (item.held_from) t.add(item.held_from);
    if (item.owner) t.add('in_progress');
    if (item.state === 'pending_approval' && item.approval?.decision) t.add('resolved');
    return [...t];
  }
  return [...TRANSITIONS[item.state]];
}

export interface TriagePayload { type?: WorkType; priority: Priority; factors?: PriorityFactors; priority_reason?: string; scope?: Scope }
export interface TransitionPayload {
  triage?: TriagePayload;
  owner?: Actor;
  waiting?: { on: string; until?: string | null };
  blocked?: { reason?: string | null };
  resolution?: { kind: ResolutionKind; summary: string };
  closure?: { method: string; evidence: EvidenceInput[] };
}
export interface TransitionRequest {
  to: WorkState; actor: Actor; at: string; reason?: string | null; payload?: TransitionPayload; newId: () => string;
}
/** Facts about the rest of the registry that a transition depends on (computed by the registry). */
export interface TransitionContext {
  /** Items that block this one and are not yet closed. */
  openBlockers: string[];
  children: { id: string; state: WorkState }[];
  /** An active repo lock is held for this item. */
  hasActiveLock: boolean;
  directory?: ActorDirectory;
  knownBrands?: ReadonlySet<string>;
}

const blank = (s: string | null | undefined) => !s || !s.trim();

export function applyTransition(item: WorkItem, req: TransitionRequest, ctx: TransitionContext): Result<WorkItem> {
  const { to, actor, at } = req;
  const from = item.state;
  const p = req.payload ?? {};
  if (!actor || blank(actor.id)) return fail('invalid_input', 'an actor is required');
  if (!WORK_STATES.includes(to)) return fail('invalid_input', `unknown state "${to}"`);
  if (item.merged_into) return fail('merged_duplicate', `this item was merged into ${item.merged_into} as a duplicate; work on that one`);

  const legal = legalTargets(item);
  if (!legal.includes(to)) {
    return fail('illegal_transition', `${from} → ${to} is not allowed${legal.length ? ` (from ${from}: ${legal.join(', ')})` : ''}`, { from, to, allowed: legal });
  }

  // Leaving a hold needs the hold's condition to be met.
  if (from === 'blocked' && ctx.openBlockers.length > 0) return fail('still_blocked', `still blocked by ${ctx.openBlockers.join(', ')}`, { openBlockers: ctx.openBlockers });
  if (from === 'pending_approval' && !item.approval?.decision) return fail('approval_decision_required', 'an approval decision is recorded before this can move on');

  let n: WorkItem = { ...item };
  const data: Record<string, unknown> = {};

  switch (to) {
    case 'triaged': {
      if (HOLD_STATES.includes(from)) break; // resuming a hold: the item was already triaged
      const tri = p.triage;
      if (!tri) {
        if (from === 'reopened' && item.priority) break;
        return fail('triage_incomplete', 'triage needs a priority (and a type and scope if they are not already right)');
      }
      const type = tri.type ?? item.type;
      if (!WORK_TYPES.includes(type)) return fail('triage_incomplete', `unknown type "${type}"`);
      if (!PRIORITIES.includes(tri.priority)) return fail('triage_incomplete', `unknown priority "${tri.priority}"`);
      const sc = validateScope(tri.scope ?? item.scope, ctx.knownBrands);
      if (!sc.ok) return sc;
      if (tri.factors) {
        const suggested = suggestPriority(tri.factors, type);
        data.suggested_priority = suggested;
        if (isLessUrgent(tri.priority, suggested) && blank(tri.priority_reason)) {
          return fail('priority_override_needs_reason', `the factors suggest ${suggested}; choosing ${tri.priority} needs a written reason`, { suggested });
        }
      }
      if (type !== item.type) data.type_from = item.type;
      n = { ...n, type, scope: sc.value, priority: tri.priority, priority_factors: tri.factors ?? item.priority_factors, priority_reason: tri.priority_reason?.trim() || null };
      data.priority = tri.priority; data.type = type;
      if (tri.priority_reason) data.priority_reason = tri.priority_reason;
      break;
    }

    case 'assigned': {
      if (HOLD_STATES.includes(from)) break; // resuming a hold: ownership is unchanged
      if (item.priority === null) return fail('triage_incomplete', 'triage (priority) comes before assignment');
      if (p.owner && !sameActor(p.owner, item.owner)) {
        const v = validateOwner(item, p.owner, actor, ctx.directory);
        if (!v.ok) return v;
        n.owner = v.value;
        data.owner = v.value.id;
      } else if (!item.owner) {
        return fail('owner_required', 'assignment needs exactly one accountable owner');
      }
      break;
    }

    case 'in_progress': {
      if (!item.owner) return fail('owner_required', 'work cannot start without an accountable owner');
      if (item.repo_scope?.material && !ctx.hasActiveLock) return fail('repo_lock_required', 'material repository work needs an active lock for this item before it starts');
      break;
    }

    case 'waiting': {
      if (blank(p.waiting?.on)) return fail('waiting_on_required', 'say who or what the work is waiting on');
      n.waiting = { on: p.waiting!.on.trim(), until: p.waiting?.until ?? null, since: at };
      data.waiting_on = n.waiting.on;
      break;
    }

    case 'blocked': {
      const reason = p.blocked?.reason?.trim() || null;
      if (ctx.openBlockers.length === 0 && !reason) return fail('blocker_required', 'blocked needs an open blocking item or a stated reason');
      n.blocked = { reason, since: at };
      data.blockers = ctx.openBlockers;
      if (reason) data.reason = reason;
      break;
    }

    case 'pending_approval': {
      if (!item.approval || item.approval.decision) return fail('approval_required', 'request an approval (who, authority, reason, evidence, recommendation) before holding for one');
      data.approval_id = item.approval.id;
      break;
    }

    case 'resolved': {
      const r = p.resolution;
      if (!r || !RESOLUTION_KINDS.includes(r.kind) || r.kind === 'duplicate' || blank(r.summary)) {
        return fail('resolution_required', 'resolving needs a resolution kind and a summary (duplicates are resolved by merging, not here)');
      }
      if (ctx.children.some((c) => c.state !== 'closed')) return fail('children_open', 'subordinate items are still open', { open: ctx.children.filter((c) => c.state !== 'closed').map((c) => c.id) });
      if (item.type === 'incident') {
        const gaps = resolveGaps(item);
        if (gaps.length) return fail('incident_incomplete', `an incident needs ${gaps.join(', ')} before it can be resolved`, { gaps });
      }
      n.resolution = { kind: r.kind, summary: r.summary.trim(), by: actor, at };
      data.resolution = r.kind;
      break;
    }

    case 'verification': break;

    case 'closed': {
      const c = p.closure;
      if (!c || blank(c.method) || !Array.isArray(c.evidence) || c.evidence.length === 0 || c.evidence.some((e) => blank(e.ref) || blank(e.summary))) {
        return fail('verification_required', 'closing needs verification: how it was checked and at least one piece of evidence');
      }
      if ((item.priority === 'P0' || item.priority === 'P1') && item.resolution && sameActor(item.resolution.by, actor)) {
        return fail('verifier_must_differ', 'a P0/P1 item is verified by someone other than whoever resolved it');
      }
      if (ctx.children.some((x) => x.state !== 'closed')) return fail('children_open', 'subordinate items are still open', { open: ctx.children.filter((x) => x.state !== 'closed').map((x) => x.id) });
      if (ctx.hasActiveLock) return fail('lock_held', 'release the repository lock before closing');
      if (item.type === 'incident') {
        const gaps = closeGaps(item);
        if (gaps.length) {
          const code = gaps[0].startsWith('learning') ? 'learning_required' : gaps[0] === 'prevention' ? 'prevention_required' : 'incident_incomplete';
          return fail(code, `an incident needs ${gaps.join(', ')} before it can be closed`, { gaps });
        }
      }
      const added = c.evidence.map((e) => ({ id: req.newId(), at, by: actor, kind: e.kind, ref: e.ref.trim(), summary: e.summary.trim() }));
      n.evidence = [...item.evidence, ...added];
      n.closure = { verified_by: actor, verified_at: at, method: c.method.trim(), evidence_ids: added.map((e) => e.id) };
      n.closed_at = at;
      data.evidence_ids = n.closure.evidence_ids;
      break;
    }

    case 'reopened': {
      if (blank(req.reason)) return fail('reopen_reason_required', 'say why it is being reopened');
      data.previous = { resolution: item.resolution, closure: item.closure, closed_at: item.closed_at };
      n.resolution = null; n.closure = null; n.closed_at = null; n.reopen_count = item.reopen_count + 1;
      break;
    }
  }

  // Entering a hold remembers where it came from; leaving one clears it.
  if (HOLD_STATES.includes(to)) n.held_from = from;
  else if (HOLD_STATES.includes(from)) n.held_from = null;
  if (from === 'waiting') n.waiting = null;
  if (from === 'blocked') n.blocked = null;

  n.state = to;
  return ok(appendEvent(n, { at, actor, kind: 'state_change', from, to, reason: req.reason ?? null, data }));
}
