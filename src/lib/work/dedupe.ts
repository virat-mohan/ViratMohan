// Deduplication: one issue = one canonical work item.
//
// Every report (Command Centre, brand support email, WhatsApp, a founder request, an agent's
// detection, a system alert) is first recorded as a SOURCE EVENT, then resolved to a work item:
//   1. the same (channel, external_ref) again            → the same event; nothing new (idempotent)
//   2. the same thread, already attached to an open item → attach
//   3. the same fingerprint on an open item              → attach  (detectors give the same issue the same fingerprint)
//   4. a similar open report (same brand, compatible type, close in time, enough shared words)
//                                                         → UNCERTAIN: a new item is created and linked as a possible
//                                                           duplicate. It is never auto-merged; a person or the owner decides.
//   5. otherwise                                          → a new item.
// Deterministic and cheap on purpose: no AI. The similarity threshold and window are PROPOSED defaults,
// not measured; they are parameters, not facts.

import type { SourceEvent, WorkItem, WorkLink } from './types';

// Note: a decision that two EXISTING items are not duplicates (a `not_duplicate` link) is applied by the
// registry when it proposes links between items; an incoming report has no item yet to compare against.

export interface DedupePolicy { similarityThreshold: number; windowMs: number }
export const DEFAULT_DEDUPE_POLICY: DedupePolicy = { similarityThreshold: 0.6, windowMs: 7 * 24 * 60 * 60 * 1000 };

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'are', 'was', 'not', 'you', 'our', 'can', 'has', 'have', 'its', 'please', 'from', 'when', 'will', 'been', 'but', 'any', 'all']);

export function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Follow merged_into to the canonical item. Returns null on a broken or cyclic chain. */
export function rootOf(items: ReadonlyMap<string, WorkItem>, id: string): WorkItem | null {
  const seen = new Set<string>();
  let cur = items.get(id) ?? null;
  while (cur && cur.merged_into) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    cur = items.get(cur.merged_into) ?? null;
  }
  return cur;
}

export type MatchDecision =
  | { kind: 'duplicate_event'; existing: SourceEvent }
  | { kind: 'attach'; workId: string; via: 'thread' | 'fingerprint' }
  | { kind: 'possible_duplicate'; candidates: { id: string; score: number; closed: boolean; reason: string }[] }
  | { kind: 'new' };

export function matchSourceEvent(
  ev: Pick<SourceEvent, 'channel' | 'external_ref' | 'thread_ref' | 'fingerprint' | 'brand' | 'title' | 'summary' | 'type_hint' | 'received_at'>,
  view: { events: readonly SourceEvent[]; items: ReadonlyMap<string, WorkItem>; links: readonly WorkLink[] },
  policy: DedupePolicy,
): MatchDecision {
  const same = view.events.find((e) => e.channel === ev.channel && e.external_ref === ev.external_ref);
  if (same) return { kind: 'duplicate_event', existing: same };

  const closedHits: { id: string; score: number; closed: boolean; reason: string }[] = [];
  const consider = (workId: string | null, via: 'thread' | 'fingerprint'): MatchDecision | null => {
    if (!workId) return null;
    const root = rootOf(view.items, workId);
    if (!root) return null;
    if (root.state !== 'closed') return { kind: 'attach', workId: root.id, via };
    closedHits.push({ id: root.id, score: 1, closed: true, reason: `same ${via} as a closed item (possible regression)` });
    return null;
  };

  if (ev.thread_ref) {
    for (const e of view.events) {
      if (e.channel === ev.channel && e.thread_ref === ev.thread_ref) { const d = consider(e.work_id, 'thread'); if (d) return d; }
    }
  }
  if (ev.fingerprint) {
    for (const e of view.events) {
      if (e.fingerprint === ev.fingerprint) { const d = consider(e.work_id, 'fingerprint'); if (d) return d; }
    }
  }

  const mine = tokens(`${ev.title} ${ev.summary}`);
  const at = Date.parse(ev.received_at);
  const scored: { id: string; score: number; closed: boolean; reason: string }[] = [];
  for (const it of view.items.values()) {
    if (it.state === 'closed' || it.merged_into || (it.level !== 'work_item' && it.level !== 'subtask')) continue;
    if (ev.type_hint && it.type !== ev.type_hint) continue;
    if ((ev.brand ?? null) !== (it.scope.brand ?? null)) continue;
    if (Math.abs(Date.parse(it.created_at) - at) > policy.windowMs) continue;
    const score = jaccard(mine, tokens(`${it.title} ${it.description}`));
    if (score >= policy.similarityThreshold) scored.push({ id: it.id, score: Math.round(score * 100) / 100, closed: false, reason: `shares ${Math.round(score * 100)}% of its words with an open item` });
  }
  const candidates = [...closedHits, ...scored.sort((a, b) => b.score - a.score)].slice(0, 3);
  const fresh = candidates;
  return fresh.length ? { kind: 'possible_duplicate', candidates: fresh } : { kind: 'new' };
}
