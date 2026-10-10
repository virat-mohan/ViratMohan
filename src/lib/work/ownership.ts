// Ownership: ONE work item → ONE accountable owner. Supporting actors assist, observers watch.
// The owner is responsible for moving the item to resolution. A brand CEO owns the business
// outcome; a specialist may own an execution subtask beneath it (each item has exactly one owner).
//
// An actor holds at most one role on an item (owner, supporting, or observer), so who is
// accountable is never ambiguous. Prince gets work only through Virat (ORG-SOP: "Work for Prince:
// Virat assigns"), so he cannot be made owner or supporting by anyone else.

import type { Actor, Result, WorkItem } from './types';
import { fail, ok } from './types';
import { isAccountableKind, isPrince, isVirat, sameActor, type ActorDirectory } from './actors';

export type Role = 'owner' | 'supporting' | 'observer';

export function roleOf(item: Pick<WorkItem, 'owner' | 'supporting' | 'observers'>, actor: Actor): Role | null {
  if (sameActor(item.owner, actor)) return 'owner';
  if (item.supporting.some((a) => sameActor(a, actor))) return 'supporting';
  if (item.observers.some((a) => sameActor(a, actor))) return 'observer';
  return null;
}

function checkKnown(actor: Actor, directory?: ActorDirectory): Result<true> {
  if (!actor || typeof actor.id !== 'string' || !actor.id.trim()) return fail('owner_invalid', 'an actor needs an id');
  if (directory && (actor.kind === 'agent' || actor.kind === 'human')) {
    const k = directory.kindOf(actor.id);
    if (k === null) return fail('owner_invalid', `${actor.id} is not an org member`);
    if (k !== actor.kind) return fail('owner_invalid', `${actor.id} is a ${k}, not a ${actor.kind}`);
  }
  return ok(true);
}

/** May `owner` be made the accountable owner of `item`, by `by`? */
export function validateOwner(item: Pick<WorkItem, 'owner' | 'supporting' | 'observers'>, owner: Actor, by: Actor, directory?: ActorDirectory): Result<Actor> {
  if (!isAccountableKind(owner)) return fail('owner_invalid', `${owner?.kind ?? 'unknown'} actors cannot be accountable owners (external people are escalation targets, not owners)`);
  const known = checkKnown(owner, directory);
  if (!known.ok) return known;
  if (isPrince(owner) && !isVirat(by)) return fail('prince_requires_virat', 'Prince gets work only through Virat: recommend it to Virat and let him assign it');
  const role = roleOf(item, owner);
  if (role === 'supporting' || role === 'observer') return fail('role_conflict', `${owner.id} is already ${role} on this item; remove that role first`);
  return ok({ kind: owner.kind, id: owner.id, ...(owner.passport ? { passport: owner.passport } : {}) });
}

export function validateSupporting(item: Pick<WorkItem, 'owner' | 'supporting' | 'observers'>, actor: Actor, by: Actor, directory?: ActorDirectory): Result<Actor> {
  if (!isAccountableKind(actor)) return fail('owner_invalid', 'supporting actors must be agents or org members');
  const known = checkKnown(actor, directory);
  if (!known.ok) return known;
  if (isPrince(actor) && !isVirat(by)) return fail('prince_requires_virat', 'Prince gets work only through Virat');
  const role = roleOf(item, actor);
  if (role) return fail('role_conflict', `${actor.id} is already ${role} on this item`);
  return ok({ kind: actor.kind, id: actor.id });
}

export function validateObserver(item: Pick<WorkItem, 'owner' | 'supporting' | 'observers'>, actor: Actor): Result<Actor> {
  if (!actor?.id?.trim()) return fail('owner_invalid', 'an observer needs an id');
  const role = roleOf(item, actor);
  if (role) return fail('role_conflict', `${actor.id} is already ${role} on this item`);
  return ok({ kind: actor.kind, id: actor.id });
}
