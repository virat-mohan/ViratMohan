// The audit trail: every significant change is an event, appended, never edited.
// Events are frozen and hash-chained (each carries the hash of the one before), so editing,
// removing or reordering any entry is detectable. The database (migration 0055) also refuses
// UPDATE and DELETE on events. Two independent guards, because "silently overwritten" is the failure.

import { sha256Hex } from './sha256';
import type { Actor, EventKind, WorkEvent, WorkItem } from './types';

export const GENESIS_HASH = '0'.repeat(64);

/** JSON with sorted keys, so the same event always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v as object)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

export interface EventInput {
  at: string;
  actor: Actor;
  kind: EventKind;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  data?: Record<string, unknown>;
}

type Hashed = Omit<WorkEvent, 'hash'>;
const hashOf = (e: Hashed): string => sha256Hex(canonicalJson(e));

export function buildEvent(prev: WorkEvent | null, input: EventInput): WorkEvent {
  const base: Hashed = {
    seq: prev ? prev.seq + 1 : 1,
    at: input.at,
    actor: { ...input.actor },
    kind: input.kind,
    from: input.from ?? null,
    to: input.to ?? null,
    reason: input.reason ?? null,
    data: input.data ? JSON.parse(JSON.stringify(input.data)) : {},
    prev_hash: prev ? prev.hash : GENESIS_HASH,
  };
  return deepFreeze({ ...base, hash: hashOf(base) });
}

/** Returns a NEW item with the event appended. The input item and its events are never modified. */
export function appendEvent<T extends Pick<WorkItem, 'events' | 'updated_at'>>(item: T, input: EventInput): T {
  const prev = item.events.length ? item.events[item.events.length - 1] : null;
  return { ...item, events: [...item.events, buildEvent(prev, input)], updated_at: input.at };
}

export type ChainCheck = { ok: true } | { ok: false; brokenAt: number; reason: string };

/** Walk the chain from the start. Detects edits, deletions, insertions and reordering. */
export function verifyChain(events: readonly WorkEvent[]): ChainCheck {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.seq !== i + 1) return { ok: false, brokenAt: i, reason: `sequence is ${e.seq}, expected ${i + 1} (entry removed, inserted or reordered)` };
    if (e.prev_hash !== prevHash) return { ok: false, brokenAt: i, reason: 'previous-hash link does not match (entry changed, removed or reordered)' };
    const { hash, ...rest } = e;
    if (hashOf(rest) !== hash) return { ok: false, brokenAt: i, reason: 'entry content does not match its hash (entry edited)' };
    prevHash = hash;
  }
  return { ok: true };
}
