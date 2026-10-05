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

/** Everything the DB-backed registry reads/writes. Writes are append-or-upsert; work is never deleted. */
export interface WorkStore {
  loadAll(): Promise<{ items: WorkItem[]; sourceEvents: SourceEvent[]; links: WorkLink[]; locks: RepoLock[] }>;
  /** Persist a full registry snapshot idempotently (upsert items, append new events, insert new children). */
  persist(snapshot: { items: WorkItem[]; sourceEvents: SourceEvent[]; links: WorkLink[]; locks: RepoLock[] }): Promise<void>;
}

type DbResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type Sb = {
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
export function createSupabaseWorkStore(client: Sb): WorkStore {
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
    async persist(s) {
      if (s.items.length) {
        const err1 = (await client.from('work_items').upsert(s.items.map(rowFromItem), { onConflict: 'id' })).error;
        if (err1) throw new Error(`persist items: ${err1.message}`);
        // work_events is append-only and chained: insert only events beyond each item's current max seq, in order.
        const existing = await rows<{ work_id: string; seq: number }>('work_events', 'work_id, seq');
        const maxSeq = new Map<string, number>();
        for (const e of existing) maxSeq.set(e.work_id, Math.max(maxSeq.get(e.work_id) ?? 0, e.seq));
        const newEvents = s.items
          .flatMap((i) => i.events.filter((e) => e.seq > (maxSeq.get(i.id) ?? 0)).map((e) => rowFromEvent(i.id, e)))
          .sort((x, y) => (x.work_id === y.work_id ? x.seq - y.seq : x.work_id < y.work_id ? -1 : 1));
        if (newEvents.length) {
          const err2 = (await client.from('work_events').insert(newEvents)).error;
          if (err2) throw new Error(`persist events: ${err2.message}`);
        }
      }
      if (s.sourceEvents.length) {
        const err = (await client.from('work_source_events').upsert(s.sourceEvents.map((e) => ({ ...e })), { onConflict: 'id' })).error;
        if (err) throw new Error(`persist source events: ${err.message}`);
      }
      if (s.links.length) {
        const err = (await client.from('work_links').upsert(s.links.map((l) => ({ id: l.id, kind: l.kind, from_id: l.from, to_id: l.to, at: l.at, by: l.by, note: l.note, score: l.score })), { onConflict: 'id' })).error;
        if (err) throw new Error(`persist links: ${err.message}`);
      }
      if (s.locks.length) {
        const err = (await client.from('repo_locks').upsert(s.locks.map((l) => ({ ...l })), { onConflict: 'id' })).error;
        if (err) throw new Error(`persist locks: ${err.message}`);
      }
    },
  };
}
