// Database-backed Work Registry: the persistence boundary.
//
// The RULES stay in the pure contract (types, lifecycle, ownership, dedupe, locks, approvals…). This
// file is only the lossless mapping between a WorkItem (and its events, source events, links, locks)
// and the rows of migrations/0055_work_registry.sql, plus a store interface and a Supabase
// implementation. No rule is re-expressed here; a WorkItem that round-trips through the database comes
// back byte-identical (a test proves it). Server-side only (service role); never bundled to a client.

import type {
  Actor, Approval, Deadline, Escalation, Evidence, IncidentRecord, Learning, PriorityFactors, RepoLock, Resolution,
  Risk, Scope, SourceEvent, WorkEvent, WorkItem, WorkLevel, WorkLink, WorkState, WorkType,
} from './types';

// ── Row shapes (exactly the columns of 0055) ─────────────────────────────────

export interface WorkItemRow {
  id: string; level: WorkLevel; parent_id: string | null; type: WorkType; title: string; description: string;
  scope_kind: Scope['kind']; brand: string | null; founder: string | null; system: string | null; extension: string | null;
  channel: SourceEvent['channel']; requester: Actor; priority: WorkItem['priority']; priority_factors: PriorityFactors | null;
  priority_reason: string | null; state: WorkState; held_from: WorkState | null; owner_kind: 'agent' | 'human' | null;
  owner_id: string | null; supporting: Actor[]; observers: Actor[]; created_at: string; updated_at: string;
  deadline: Deadline | null; customer_impact: string | null; revenue_profit_risk: Risk | null; security_risk: Risk | null;
  evidence: Evidence[]; waiting: WorkItem['waiting']; blocked: WorkItem['blocked']; approval: Approval | null;
  escalations: Escalation[]; repo_scope: WorkItem['repo_scope']; incident: IncidentRecord | null; resolution: Resolution | null;
  closure: WorkItem['closure']; learning: Learning | null; closed_at: string | null; reopen_count: number; merged_into: string | null;
}
export interface WorkEventRow {
  work_id: string; seq: number; at: string; actor: Actor; kind: WorkEvent['kind'];
  from_value: string | null; to_value: string | null; reason: string | null; data: Record<string, unknown>; prev_hash: string; hash: string;
}

// ── Mappers (pure, lossless) ─────────────────────────────────────────────────

export function rowFromItem(i: WorkItem): WorkItemRow {
  return {
    id: i.id, level: i.level, parent_id: i.parent_id, type: i.type, title: i.title, description: i.description,
    scope_kind: i.scope.kind, brand: i.scope.brand, founder: i.scope.founder, system: i.scope.system, extension: i.scope.extension,
    channel: i.source.channel, requester: i.source.requester, priority: i.priority, priority_factors: i.priority_factors,
    priority_reason: i.priority_reason, state: i.state, held_from: i.held_from, owner_kind: (i.owner?.kind ?? null) as 'agent' | 'human' | null, owner_id: i.owner?.id ?? null,
    supporting: i.supporting, observers: i.observers, created_at: i.created_at, updated_at: i.updated_at, deadline: i.deadline,
    customer_impact: i.customer_impact, revenue_profit_risk: i.revenue_profit_risk, security_risk: i.security_risk, evidence: i.evidence,
    waiting: i.waiting, blocked: i.blocked, approval: i.approval, escalations: i.escalations, repo_scope: i.repo_scope,
    incident: i.incident, resolution: i.resolution, closure: i.closure, learning: i.learning, closed_at: i.closed_at,
    reopen_count: i.reopen_count, merged_into: i.merged_into,
  };
}

export const rowFromEvent = (workId: string, e: WorkEvent): WorkEventRow =>
  ({ work_id: workId, seq: e.seq, at: e.at, actor: e.actor, kind: e.kind, from_value: e.from, to_value: e.to, reason: e.reason, data: e.data, prev_hash: e.prev_hash, hash: e.hash });

export const eventFromRow = (r: WorkEventRow): WorkEvent =>
  ({ seq: r.seq, at: r.at, actor: r.actor, kind: r.kind, from: r.from_value, to: r.to_value, reason: r.reason, data: r.data ?? {}, prev_hash: r.prev_hash, hash: r.hash });

/** Rebuild a WorkItem from its row, its events (seq order) and the ids of the source events that resolve to it. */
export function itemFromRow(r: WorkItemRow, events: WorkEventRow[], sourceEventIds: string[]): WorkItem {
  return {
    id: r.id, ref: `W-${String(0).padStart(4, '0')}`.replace('0000', '') + '', // overwritten below from the generated column
    level: r.level, parent_id: r.parent_id, type: r.type, title: r.title, description: r.description,
    scope: { kind: r.scope_kind, brand: r.brand, founder: r.founder, system: r.system, extension: r.extension },
    source: { channel: r.channel, requester: r.requester },
    priority: r.priority, priority_factors: r.priority_factors, priority_reason: r.priority_reason, state: r.state, held_from: r.held_from,
    owner: r.owner_id ? { kind: r.owner_kind!, id: r.owner_id } : null, supporting: r.supporting ?? [], observers: r.observers ?? [],
    created_at: r.created_at, updated_at: r.updated_at, deadline: r.deadline, customer_impact: r.customer_impact,
    revenue_profit_risk: r.revenue_profit_risk, security_risk: r.security_risk, evidence: r.evidence ?? [], waiting: r.waiting, blocked: r.blocked,
    approval: r.approval, escalations: r.escalations ?? [], repo_scope: r.repo_scope, incident: r.incident, resolution: r.resolution,
    closure: r.closure, learning: r.learning, closed_at: r.closed_at, reopen_count: r.reopen_count, merged_into: r.merged_into,
    source_event_ids: [...sourceEventIds],
    events: [...events].sort((a, b) => a.seq - b.seq).map(eventFromRow),
  };
}

// ── Store interface + Supabase implementation ────────────────────────────────

/** Event count of every item as it was loaded. Lets persist write only what changed and detect a concurrent writer. */
export interface PersistOptions {
  base?: ReadonlyMap<string, number>;
  /** The other shared collections as loaded (row id to its JSON). With it, only new or changed rows are written. */
  known?: KnownRows;
}
export interface KnownRows {
  sourceEvents: ReadonlyMap<string, string>;
  links: ReadonlySet<string>;
  locks: ReadonlyMap<string, string>;
}

/** Another writer changed an item after this one loaded it. Nothing of the stale change was written for that item. */
export class WorkConflictError extends Error {
  constructor(message: string) { super(`work conflict: ${message}`); this.name = 'WorkConflictError'; }
}
const CHAIN_OR_KEY = /work conflict|does not continue the chain|duplicate key|work_events_pkey|work_items_pkey|violates unique/i;
const conflictOr = (message: string, what: string, code?: string): Error =>
  code === 'WR409' || code === '23505' || CHAIN_OR_KEY.test(message) ? new WorkConflictError(`${what}: ${message}`) : new Error(`${what}: ${message}`);

/** Everything the DB-backed registry reads/writes. Writes are append-or-upsert; work is never deleted. */
export interface WorkStore {
  loadAll(): Promise<{ items: WorkItem[]; sourceEvents: SourceEvent[]; links: WorkLink[]; locks: RepoLock[] }>;
  /** Persist a full registry snapshot idempotently (upsert items, append new events, insert new children). */
  persist(snapshot: { items: WorkItem[]; sourceEvents: SourceEvent[]; links: WorkLink[]; locks: RepoLock[] }, opts?: PersistOptions): Promise<void>;
}

type DbResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type RpcResult = PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
type Sb = {
  /** Calls a Postgres function. Required for the transactional write path (work_persist, migration 0056). */
  rpc?: (fn: string, args: Record<string, unknown>) => RpcResult;
  from(table: string): {
    select: (cols?: string) => DbResult<Record<string, unknown>>;
    upsert: (rows: unknown[], opts?: { onConflict: string; ignoreDuplicates?: boolean }) => PromiseLike<{ error: { message: string } | null }>;
    insert: (rows: unknown[]) => PromiseLike<{ error: { message: string } | null }>;
  };
};

const must = async <T>(p: Promise<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> => {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return (data ?? []) as T;
};

/**
 * Supabase-backed store. The RETURNING ref (a generated column) is read back on load so WorkItem.ref
 * reflects the database. Idempotent persist: `upsert` items by id, insert only events/children not
 * already present (events are append-only; the chain trigger rejects anything out of order).
 */
export interface WorkStoreOptions {
  /**
   * Default true: a write with a baseline is ONE call to work_persist (atomic). False exists only so tests can
   * drive a hand-written fake client that has no database function; production code never sets it.
   */
  transactional?: boolean;
}

export function createSupabaseWorkStore(client: Sb, options: WorkStoreOptions = {}): WorkStore {
  const transactional = options.transactional ?? true;
  const rows = <T>(t: string, cols = '*') => must<T[]>(client.from(t).select(cols) as unknown as Promise<{ data: T[] | null; error: { message: string } | null }>, `read ${t}`);
  return {
    async loadAll() {
      const [itemRows, eventRows, seRows, linkRows, lockRows] = await Promise.all([
        rows<WorkItemRow & { ref: string }>('work_items'), rows<WorkEventRow>('work_events'),
        rows<SourceEvent & { work_id: string | null }>('work_source_events'), rows<WorkLink & { from_id: string; to_id: string }>('work_links'), rows<RepoLock>('repo_locks'),
      ]);
      const eventsByItem = new Map<string, WorkEventRow[]>();
      for (const e of eventRows) (eventsByItem.get(e.work_id) ?? eventsByItem.set(e.work_id, []).get(e.work_id)!).push(e);
      const seByItem = new Map<string, string[]>();
      for (const s of seRows) if (s.work_id) (seByItem.get(s.work_id) ?? seByItem.set(s.work_id, []).get(s.work_id)!).push(s.id);
      const items = itemRows.map((r) => { const it = itemFromRow(r, eventsByItem.get(r.id) ?? [], seByItem.get(r.id) ?? []); it.ref = r.ref; return it; });
      const links: WorkLink[] = linkRows.map((l) => ({ id: l.id, kind: l.kind, from: l.from_id, to: l.to_id, at: l.at, by: l.by, note: l.note, score: l.score }));
      return { items, sourceEvents: seRows.map(({ work_id, ...s }) => ({ ...s, work_id })) as SourceEvent[], links, locks: lockRows };
    },
    async persist(s, opts = {}) {
      if (transactional && opts.base) {
        if (!opts.known) throw new Error('persist with a base also needs the known rows; take both from persistBaseline()');
        if (!client.rpc) throw new Error('the transactional store needs a client with rpc(); work_persist (migration 0056) is the only safe write path');
        const base = opts.base; const known = opts.known;
        const changedItems = s.items.filter((i) => i.events.length !== (base.get(i.id) ?? 0));
        const events = changedItems
          .flatMap((i) => i.events.filter((e) => e.seq > (base.get(i.id) ?? 0)).map((e) => rowFromEvent(i.id, e)))
          .sort((x, y) => (x.work_id === y.work_id ? x.seq - y.seq : x.work_id < y.work_id ? -1 : 1));
        const payload = {
          expect: Object.fromEntries(changedItems.filter((i) => base.has(i.id)).map((i) => [i.id, base.get(i.id)!])),
          items_new: changedItems.filter((i) => !base.has(i.id)).map(rowFromItem),
          items_upd: changedItems.filter((i) => base.has(i.id)).map(rowFromItem),
          events,
          source_events_new: s.sourceEvents.filter((e) => !known.sourceEvents.has(e.id)),
          source_events_upd: s.sourceEvents.filter((e) => known.sourceEvents.has(e.id) && known.sourceEvents.get(e.id) !== JSON.stringify(e)),
          locks_new: s.locks.filter((l) => !known.locks.has(l.id)),
          locks_upd: s.locks.filter((l) => known.locks.has(l.id) && known.locks.get(l.id) !== JSON.stringify(l)),
          links_new: s.links.filter((l) => !known.links.has(l.id)).map((l) => ({ id: l.id, kind: l.kind, from_id: l.from, to_id: l.to, at: l.at, by: l.by, note: l.note, score: l.score })),
        };
        const empty = Object.entries(payload).every(([k, v]) => (k === 'expect' ? Object.keys(v as object).length === 0 : (v as unknown[]).length === 0));
        if (empty) return;
        const { error } = await client.rpc('work_persist', { p: payload });
        if (error) {
          if (error.code === 'PGRST202' || /could not find the function|function .*work_persist.* does not exist/i.test(error.message)) {
            throw new Error('work_persist is not installed in this database: apply migrations/0056_work_persist.sql by hand before deploying this code (see case-study/WORK-REGISTRY.md)');
          }
          throw conflictOr(error.message, 'persist', error.code);
        }
        return;
      }
      const base = opts.base;
      const known = base ? opts.known : undefined;
      // With a base (the event count of every item as loaded) only changed items are written, and each is
      // checked against the database first. With `known` too, links, source events and locks are written only
      // if new or changed. Without them this is the legacy blind mode (single writer only).
      const items = base ? s.items.filter((i) => i.events.length !== (base.get(i.id) ?? 0)) : s.items;
      const ins = async (table: string, rowsToWrite: unknown[], what: string) => {
        if (!rowsToWrite.length) return;
        const e = (await client.from(table).insert(rowsToWrite)).error;
        if (e) throw conflictOr(e.message, what);
      };
      const ups = async (table: string, rowsToWrite: unknown[], onConflict: string, what: string) => {
        if (!rowsToWrite.length) return;
        const e = (await client.from(table).upsert(rowsToWrite, { onConflict })).error;
        if (e) throw new Error(`${what}: ${e.message}`);
      };
      const lockRow = (l: RepoLock) => ({ ...l });
      const linkRow = (l: WorkLink) => ({ id: l.id, kind: l.kind, from_id: l.from, to_id: l.to, at: l.at, by: l.by, note: l.note, score: l.score });

      if (items.length && !base) await ups('work_items', items.map(rowFromItem), 'id', 'persist items');

      const newSe = known ? s.sourceEvents.filter((e) => !known.sourceEvents.has(e.id)) : [];
      const newLocks = known ? s.locks.filter((l) => !known.locks.has(l.id)) : [];
      const changedLocks = known ? s.locks.filter((l) => known.locks.has(l.id) && known.locks.get(l.id) !== JSON.stringify(l)) : [];
      const changedSe = known ? s.sourceEvents.filter((e) => known.sourceEvents.has(e.id) && known.sourceEvents.get(e.id) !== JSON.stringify(e)) : [];
      const newLinks = known ? s.links.filter((l) => !known.links.has(l.id)) : [];

      let maxSeq = new Map<string, number>();
      if (items.length) {
        // work_events is append-only and chained: the (work_id, seq) key and the chain trigger are the arbiter.
        const existing = await rows<{ work_id: string; seq: number }>('work_events', 'work_id, seq');
        for (const e of existing) maxSeq.set(e.work_id, Math.max(maxSeq.get(e.work_id) ?? 0, e.seq));
        if (base) {
          for (const i of items) {
            if ((maxSeq.get(i.id) ?? 0) !== (base.get(i.id) ?? 0)) throw new WorkConflictError(`${i.ref} changed since it was loaded`);
          }
        }
      }
      if (newSe.length) {
        // The same report from another writer: refuse before any new item row is written.
        const have = await rows<{ channel: string; external_ref: string }>('work_source_events', 'channel, external_ref');
        const keys = new Set(have.map((r) => `${r.channel}\u0000${r.external_ref}`));
        const dup = newSe.find((e) => keys.has(`${e.channel}\u0000${e.external_ref}`));
        if (dup) throw new WorkConflictError(`source event ${dup.channel}/${dup.external_ref} was already ingested`);
      }

      if (base) {
        // Order matters. Rows the database can refuse by a unique key go before the events that describe them.
        await ins('work_items', items.filter((i) => !base.has(i.id)).map(rowFromItem), 'persist new items');
        await ins('repo_locks', newLocks.map(lockRow), 'persist new locks');
        await ins('work_source_events', newSe.map((e) => ({ ...e })), 'persist new source events');
      }
      if (items.length) {
        const from = (id: string) => (base ? base.get(id) ?? 0 : maxSeq.get(id) ?? 0);
        const newEvents = items
          .flatMap((i) => i.events.filter((e) => e.seq > from(i.id)).map((e) => rowFromEvent(i.id, e)))
          .sort((x, y) => (x.work_id === y.work_id ? x.seq - y.seq : x.work_id < y.work_id ? -1 : 1));
        // One statement: either every new event lands or none does, and the existing item rows are still untouched.
        await ins('work_events', newEvents, 'persist events');
        if (base) await ups('work_items', items.filter((i) => base.has(i.id)).map(rowFromItem), 'id', 'persist items');
      }

      if (known) {
        await ins('work_links', newLinks.map(linkRow), 'persist new links');
        await ups('work_source_events', changedSe.map((e) => ({ ...e })), 'id', 'persist source events');
        await ups('repo_locks', changedLocks.map(lockRow), 'id', 'persist locks');
      } else {
        await ups('work_source_events', s.sourceEvents.map((e) => ({ ...e })), 'id', 'persist source events');
        await ups('work_links', s.links.map(linkRow), 'id', 'persist links');
        await ups('repo_locks', s.locks.map(lockRow), 'id', 'persist locks');
      }
    },
  };
}
