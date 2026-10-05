// The Work Registry: the API foundation over the canonical work object.
//
// `InMemoryWorkRegistry` is the reference implementation (used by the tests and fixtures). It holds
// no connection to anything live. A database-backed registry implements the same operations over the
// tables in migrations/0055_work_registry.sql; the rules live here, once, not in each store.
//
// Every operation returns a Result and never throws on bad input: an illegal request returns a typed
// error and changes nothing. Every accepted change appends to the item's hash-chained audit trail.

import type {
  Actor, Approval, ApprovalDecision, Deadline, Escalation, Evidence, EvidenceInput, HumanCoverage, IncidentRecord, Learning,
  LinkKind, Priority, Quantified, RepoLock, RepoScope, Result, Risk, Scope, SourceChannel, SourceEvent, WorkItem, WorkLevel,
  WorkLink, WorkState, WorkType,
} from './types';
import { EVIDENCE_KINDS, PRIORITIES, SOURCE_CHANNELS, WORK_LEVELS, WORK_TYPES, fail, ok } from './types';
import { appendEvent, verifyChain, type ChainCheck } from './audit';
import { applyTransition, legalTargets, type TransitionContext, type TransitionPayload } from './lifecycle';
import { validateScope, isPlatformScope, Scopes } from './scope';
import { validateObserver, validateOwner, validateSupporting } from './ownership';
import { actorIdLooksPersonal, isPrince, isVirat, sameActor, type ActorDirectory, coverageLabel } from './actors';
import { emptyIncident, validateQuantified } from './incident';
import { validateApprovalRequest, validateDecision, type ApprovalRequestInput } from './approval';
import { validateHumanEscalation, type HumanEscalationInput } from './escalation';
import { DEFAULT_LOCK_POLICY, findConflicts, isLockActive, preflight, type LockPolicy, type PreflightReport } from './repo-lock';
import { DEFAULT_DEDUPE_POLICY, matchSourceEvent, rootOf, type DedupePolicy } from './dedupe';
import { moreUrgent } from './priority';

export interface RegistryOptions {
  now?: () => string;
  newId?: () => string;
  /** Check that agent/human ids are real org members (the `org_members` table). */
  directory?: ActorDirectory;
  /** The central registry's brand keys. Unknown brands are refused when given. */
  knownBrands?: ReadonlySet<string>;
  lockPolicy?: Partial<LockPolicy>;
  dedupePolicy?: Partial<DedupePolicy>;
}

export interface NewWorkInput {
  level?: WorkLevel;
  parent_id?: string | null;
  type: WorkType;
  title: string;
  description?: string;
  scope: Scope;
  source?: { channel?: SourceChannel; requester?: Actor };
  deadline?: Deadline | null;
  customer_impact?: string | null;
  revenue_profit_risk?: Risk | null;
  security_risk?: Risk | null;
}

export interface IngestInput {
  channel: SourceChannel;
  external_ref: string;
  thread_ref?: string | null;
  fingerprint?: string | null;
  received_at?: string;
  reporter: Actor;
  brand?: string | null;
  title: string;
  summary: string;
  type_hint?: WorkType | null;
}

export interface IngestResult {
  event: SourceEvent;
  outcome: 'duplicate_event' | 'created' | 'attached' | 'possible_duplicate';
  item: WorkItem;
  candidates: { id: string; score: number; closed: boolean; reason: string }[];
}

export interface ItemFilter { state?: WorkState | WorkState[]; owner?: string; brand?: string; level?: WorkLevel; type?: WorkType; parent?: string; openOnly?: boolean }

const SYSTEM: Actor = { kind: 'system', id: 'system:work-registry' };
const DEFAULT_TYPE_BY_CHANNEL: Record<SourceChannel, WorkType> = {
  command_centre: 'support', brand_support_email: 'support', whatsapp: 'support', founder_request: 'request',
  agent_detection: 'alert', system_alert: 'alert', internal: 'task',
};
const PARENT_LEVEL: Record<WorkLevel, WorkLevel | null> = { objective: null, initiative: 'objective', work_item: 'initiative', subtask: 'work_item' };
const ACTIVE_OWNED: readonly WorkState[] = ['assigned', 'in_progress', 'waiting', 'blocked', 'pending_approval', 'reopened'];

const blank = (s: string | null | undefined) => !s || !s.trim();
const isIso = (s: string) => !Number.isNaN(Date.parse(s));
const uniq = <T>(a: T[]) => [...new Set(a)];

function defaultId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = (Math.random() * 16) | 0; return (ch === 'x' ? r : (r & 3) | 8).toString(16); });
}

export class InMemoryWorkRegistry {
  private items = new Map<string, WorkItem>();
  private sourceEvents: SourceEvent[] = [];
  private links: WorkLink[] = [];
  private locks: RepoLock[] = [];
  private counter = 0;
  readonly now: () => string;
  readonly newId: () => string;
  private readonly directory?: ActorDirectory;
  private readonly knownBrands?: ReadonlySet<string>;
  private readonly lockPolicy: LockPolicy;
  private readonly dedupePolicy: DedupePolicy;

  constructor(opts: RegistryOptions = {}) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.newId = opts.newId ?? defaultId;
    this.directory = opts.directory;
    this.knownBrands = opts.knownBrands;
    this.lockPolicy = { ...DEFAULT_LOCK_POLICY, ...(opts.lockPolicy ?? {}) };
    this.dedupePolicy = { ...DEFAULT_DEDUPE_POLICY, ...(opts.dedupePolicy ?? {}) };
  }

  // ── reads ────────────────────────────────────────────────────────────────

  get(id: string): WorkItem | undefined { return this.items.get(id); }
  list(f: ItemFilter = {}): WorkItem[] {
    const states = f.state === undefined ? null : Array.isArray(f.state) ? f.state : [f.state];
    return [...this.items.values()].filter((i) =>
      (!states || states.includes(i.state)) && (!f.owner || i.owner?.id === f.owner) && (!f.brand || i.scope.brand === f.brand) &&
      (!f.level || i.level === f.level) && (!f.type || i.type === f.type) && (!f.parent || i.parent_id === f.parent) &&
      (!f.openOnly || (i.state !== 'closed' && !i.merged_into)));
  }
  children(id: string): WorkItem[] { return this.list({ parent: id }); }
  links_(): readonly WorkLink[] { return this.links; }
  linksOf(id: string): WorkLink[] { return this.links.filter((l) => l.from === id || l.to === id); }
  sourceEventsOf(id: string): SourceEvent[] { return this.sourceEvents.filter((e) => e.work_id === id); }
  allSourceEvents(): readonly SourceEvent[] { return this.sourceEvents; }
  locksOf(id: string): RepoLock[] { return this.locks.filter((l) => l.work_id === id); }
  activeLocks(): RepoLock[] { const n = this.now(); return this.locks.filter((l) => isLockActive(l, n)); }
  openBlockersOf(id: string): string[] {
    return this.links.filter((l) => l.kind === 'blocks' && l.to === id && (this.items.get(l.from)?.state ?? 'closed') !== 'closed').map((l) => l.from);
  }
  /** Evidence list of ACTIONS taken, newest last. Actions are audit events of kind "action". */
  actionsOf(id: string) { return (this.items.get(id)?.events ?? []).filter((e) => e.kind === 'action'); }
  verifyAudit(id: string): Result<ChainCheck> {
    const it = this.items.get(id);
    if (!it) return fail('not_found', `no work item ${id}`);
    return ok(verifyChain(it.events));
  }

  // ── internals ────────────────────────────────────────────────────────────

  private save(i: WorkItem): WorkItem { this.items.set(i.id, i); return i; }
  private load(id: string): Result<WorkItem> { const i = this.items.get(id); return i ? ok(i) : fail('not_found', `no work item ${id}`); }
  /** An item that may still be edited: not closed, not merged away. */
  private editable(id: string): Result<WorkItem> {
    const r = this.load(id);
    if (!r.ok) return r;
    if (r.value.merged_into) return fail('merged_duplicate', `${r.value.ref} was merged into ${r.value.merged_into}`);
    if (r.value.state === 'closed') return fail('closed_item', `${r.value.ref} is closed; reopen it first`);
    return r;
  }
  private ctxFor(i: WorkItem): TransitionContext {
    return {
      openBlockers: this.openBlockersOf(i.id),
      children: this.children(i.id).map((c) => ({ id: c.id, state: c.state })),
      hasActiveLock: this.activeLockFor(i.id) !== null,
      directory: this.directory,
      knownBrands: this.knownBrands,
    };
  }
  private activeLockFor(workId: string): RepoLock | null {
    const n = this.now();
    return this.locks.find((l) => l.work_id === workId && isLockActive(l, n)) ?? null;
  }
  private ev(i: WorkItem, kind: Parameters<typeof appendEvent>[1]['kind'], actor: Actor, extra: { from?: string | null; to?: string | null; reason?: string | null; data?: Record<string, unknown> } = {}): WorkItem {
    return appendEvent(i, { at: this.now(), actor, kind, ...extra });
  }

  /** Locks past their expiry stop counting and are recorded as expired in the item's trail. */
  sweepLocks(): number {
    const n = this.now();
    let swept = 0;
    this.locks = this.locks.map((l) => {
      if (l.released_at === null && Date.parse(l.expires_at) <= Date.parse(n)) {
        swept++;
        const released = { ...l, released_at: l.expires_at, released_reason: 'expired', released_by: SYSTEM };
        const it = this.items.get(l.work_id);
        if (it) this.save(this.ev(it, 'lock_released', SYSTEM, { reason: 'expired', data: { lock_id: l.id, repository: l.repository } }));
        return released;
      }
      return l;
    });
    return swept;
  }

  private releaseLocksFor(workId: string, by: Actor, reason: string): void {
    const n = this.now();
    this.locks = this.locks.map((l) => {
      if (l.work_id === workId && l.released_at === null) {
        const it = this.items.get(workId);
        if (it) this.save(this.ev(it, 'lock_released', by, { reason, data: { lock_id: l.id, repository: l.repository } }));
        return { ...l, released_at: n, released_reason: reason, released_by: by };
      }
      return l;
    });
  }

  // ── create ───────────────────────────────────────────────────────────────

  createItem(input: NewWorkInput, actor: Actor): Result<WorkItem> {
    if (!actor?.id) return fail('invalid_input', 'an actor is required');
    if (actorIdLooksPersonal(actor.id) || (input.source?.requester && actorIdLooksPersonal(input.source.requester.id))) return fail('invalid_input', 'actor ids are references, not an email address or phone number');
    if (blank(input.title)) return fail('invalid_input', 'a title is required');
    const level = input.level ?? 'work_item';
    if (!WORK_LEVELS.includes(level)) return fail('invalid_input', `unknown level "${level}"`);
    if (!WORK_TYPES.includes(input.type)) return fail('invalid_input', `unknown type "${input.type}"`);
    const sc = validateScope(input.scope, this.knownBrands);
    if (!sc.ok) return sc;
    if (input.deadline && !isIso(input.deadline.at)) return fail('invalid_input', 'deadline.at must be a date-time');

    const parentLevel = PARENT_LEVEL[level];
    if (level === 'objective' && input.parent_id) return fail('hierarchy_invalid', 'an objective has no parent');
    if (level === 'subtask' && !input.parent_id) return fail('hierarchy_invalid', 'a subtask needs a work item as its parent');
    if (input.parent_id) {
      const p = this.items.get(input.parent_id);
      if (!p) return fail('hierarchy_invalid', `parent ${input.parent_id} does not exist`);
      if (p.state === 'closed' || p.merged_into) return fail('hierarchy_invalid', `parent ${p.ref} is closed`);
      if (p.level !== parentLevel) return fail('hierarchy_invalid', `a ${level} sits under a ${parentLevel}, not a ${p.level}`);
      if ((p.scope.kind === 'brand' || p.scope.kind === 'client_extension') && sc.value.brand !== p.scope.brand) {
        return fail('hierarchy_invalid', `a child of ${p.ref} must be for the same brand`);
      }
    }
    for (const r of [input.revenue_profit_risk, input.security_risk]) {
      if (r?.quantified) { const q = validateQuantified(r.quantified, 'risk'); if (!q.ok) return q; }
    }

    const at = this.now();
    const base: WorkItem = {
      id: this.newId(), ref: `W-${String(++this.counter).padStart(4, '0')}`, level, parent_id: input.parent_id ?? null, type: input.type,
      title: input.title.trim(), description: input.description?.trim() ?? '', scope: sc.value,
      source: { channel: input.source?.channel ?? 'internal', requester: input.source?.requester ?? actor },
      priority: null, priority_factors: null, priority_reason: null, state: 'new', held_from: null,
      owner: null, supporting: [], observers: [], created_at: at, updated_at: at,
      deadline: input.deadline ?? null, customer_impact: input.customer_impact ?? null,
      revenue_profit_risk: input.revenue_profit_risk ?? null, security_risk: input.security_risk ?? null,
      evidence: [], waiting: null, blocked: null, approval: null, escalations: [], repo_scope: null,
      incident: input.type === 'incident' ? emptyIncident() : null,
      resolution: null, closure: null, learning: null, closed_at: null, reopen_count: 0, merged_into: null, source_event_ids: [], events: [],
    };
    if (!SOURCE_CHANNELS.includes(base.source.channel)) return fail('invalid_input', `unknown channel "${base.source.channel}"`);
    const item = this.ev(base, 'created', actor, { to: 'new', data: { level, type: input.type, scope: sc.value, channel: base.source.channel, parent_id: base.parent_id } });
    return ok(this.save(item));
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  transition(id: string, to: WorkState, actor: Actor, opts: { payload?: TransitionPayload; reason?: string | null } = {}): Result<WorkItem> {
    this.sweepLocks();
    const r = this.load(id);
    if (!r.ok) return r;
    const res = applyTransition(r.value, { to, actor, at: this.now(), reason: opts.reason ?? null, payload: opts.payload, newId: this.newId }, this.ctxFor(r.value));
    if (!res.ok) return res;
    this.save(res.value);
    if (to === 'resolved') this.releaseLocksFor(id, actor, 'item resolved');
    return ok(this.items.get(id)!);
  }

  legalNext(id: string): WorkState[] { const i = this.items.get(id); return i ? legalTargets(i) : []; }

  // ── fields, evidence, actions ────────────────────────────────────────────

  updateFields(id: string, patch: Partial<Pick<WorkItem, 'title' | 'description' | 'deadline' | 'customer_impact' | 'revenue_profit_risk' | 'security_risk'>>, actor: Actor, reason?: string): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    const next: WorkItem = { ...r.value };
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
      const v = patch[k];
      if (k === 'title' && blank(v as string)) return fail('invalid_input', 'a title cannot be blank');
      if (k === 'deadline' && v && !isIso((v as Deadline).at)) return fail('invalid_input', 'deadline.at must be a date-time');
      if ((k === 'revenue_profit_risk' || k === 'security_risk') && v && (v as Risk).quantified) {
        const q = validateQuantified((v as Risk).quantified, k); if (!q.ok) return q;
      }
      if (JSON.stringify(r.value[k]) !== JSON.stringify(v)) { changed[k] = { from: r.value[k], to: v }; (next as unknown as Record<string, unknown>)[k] = v; }
    }
    if (!Object.keys(changed).length) return ok(r.value);
    return ok(this.save(this.ev(next, 'field_change', actor, { reason: reason ?? null, data: { changed } })));
  }

  /** Changing priority after triage is an audited decision with a reason. */
  setPriority(id: string, priority: Priority, reason: string, actor: Actor): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    if (r.value.priority === null) return fail('triage_incomplete', 'set the first priority by triaging');
    if (!PRIORITIES.includes(priority)) return fail('invalid_input', `unknown priority "${priority}"`);
    if (blank(reason)) return fail('priority_override_needs_reason', 'a priority change needs a reason');
    if (r.value.priority === priority) return ok(r.value);
    return ok(this.save(this.ev({ ...r.value, priority, priority_reason: reason.trim() }, 'priority_set', actor, { from: r.value.priority, to: priority, reason })));
  }

  addEvidence(id: string, e: EvidenceInput, actor: Actor): Result<Evidence> {
    const r = this.editable(id);
    if (!r.ok) return r;
    if (!EVIDENCE_KINDS.includes(e.kind) || blank(e.ref) || blank(e.summary)) return fail('invalid_input', 'evidence needs a kind, a reference and a summary');
    const ev: Evidence = { id: this.newId(), at: this.now(), by: actor, kind: e.kind, ref: e.ref.trim(), summary: e.summary.trim() };
    this.save(this.ev({ ...r.value, evidence: [...r.value.evidence, ev] }, 'evidence_added', actor, { data: { evidence_id: ev.id, kind: ev.kind, ref: ev.ref } }));
    return ok(ev);
  }

  /** ACTION: a step taken (what was done or tried). Recorded in the audit trail; never edited. */
  logAction(id: string, a: { summary: string; evidence_ids?: string[] }, actor: Actor): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    if (blank(a.summary)) return fail('invalid_input', 'an action needs a summary');
    const unknown = (a.evidence_ids ?? []).filter((x) => !r.value.evidence.some((e) => e.id === x));
    if (unknown.length) return fail('invalid_input', `unknown evidence ${unknown.join(', ')}`);
    return ok(this.save(this.ev(r.value, 'action', actor, { data: { summary: a.summary.trim(), evidence_ids: a.evidence_ids ?? [] } })));
  }

  setLearning(id: string, l: Learning, actor: Actor): Result<WorkItem> {
    const r = this.load(id);
    if (!r.ok) return r;
    if (r.value.merged_into) return fail('merged_duplicate', 'merged duplicates carry no learning');
    if (blank(l.lesson)) return fail('invalid_input', 'a lesson is required');
    return ok(this.save(this.ev({ ...r.value, learning: { lesson: l.lesson.trim(), reference: l.reference ?? null, rule_added: !!l.rule_added } }, 'field_change', actor, { data: { changed: { learning: { from: r.value.learning, to: l } } } })));
  }

  updateIncident(id: string, u: { diagnosis?: string; result?: string; cost?: Quantified | null; revenue_impact?: Quantified | null; decision?: string; addTests?: { description: string; result: 'pass' | 'fail' | 'inconclusive'; evidence_id?: string | null }[]; addPrevention?: { action: string; work_id?: string | null }[] }, actor: Actor): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    if (r.value.type !== 'incident' || !r.value.incident) return fail('invalid_input', 'only an incident has an incident record');
    const cur: IncidentRecord = r.value.incident;
    const next: IncidentRecord = { ...cur, tests: [...cur.tests], prevention: [...cur.prevention] };
    if (u.diagnosis !== undefined) { if (blank(u.diagnosis)) return fail('invalid_input', 'diagnosis cannot be blank'); next.diagnosis = u.diagnosis.trim(); }
    if (u.result !== undefined) { if (blank(u.result)) return fail('invalid_input', 'result cannot be blank'); next.result = u.result.trim(); }
    for (const k of ['cost', 'revenue_impact'] as const) {
      if (u[k] !== undefined) { const q = validateQuantified(u[k], k); if (!q.ok) return q; next[k] = q.value; }
    }
    if (u.decision !== undefined) { if (blank(u.decision)) return fail('invalid_input', 'decision cannot be blank'); next.decision = { decision: u.decision.trim(), by: actor, at: this.now() }; }
    for (const t of u.addTests ?? []) {
      if (blank(t.description)) return fail('invalid_input', 'a test needs a description');
      if (t.evidence_id && !r.value.evidence.some((e) => e.id === t.evidence_id)) return fail('invalid_input', `unknown evidence ${t.evidence_id}`);
      next.tests.push({ description: t.description.trim(), result: t.result, evidence_id: t.evidence_id ?? null });
    }
    for (const pv of u.addPrevention ?? []) {
      if (blank(pv.action)) return fail('invalid_input', 'a prevention step needs an action');
      next.prevention.push({ action: pv.action.trim(), work_id: pv.work_id ?? null });
    }
    return ok(this.save(this.ev({ ...r.value, incident: next }, 'incident_updated', actor, { data: { fields: Object.keys(u) } })));
  }

  // ── ownership ────────────────────────────────────────────────────────────

  /** Change the accountable owner of an item that already has one. Exactly one owner always. */
  reassign(id: string, newOwner: Actor, by: Actor, reason: string, opts: { keepPreviousAsSupporting?: boolean } = {}): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    const it = r.value;
    if (!it.owner || !ACTIVE_OWNED.includes(it.state)) return fail('owner_required', 'reassign applies to an assigned item; assign it first');
    if (blank(reason)) return fail('invalid_input', 'a reassignment needs a reason');
    const v = validateOwner(it, newOwner, by, this.directory);
    if (!v.ok) return v;
    let n: WorkItem = { ...it, owner: v.value };
    if (opts.keepPreviousAsSupporting) n = this.demoteToSupporting(n, it.owner, by);
    return ok(this.save(this.ev(n, 'owner_assigned', by, { from: it.owner.id, to: v.value.id, reason })));
  }

  private demoteToSupporting(n: WorkItem, prev: Actor, by: Actor): WorkItem {
    // Prince is only ever added to an item by Virat; otherwise the previous owner stays on as an observer.
    if (isPrince(prev) && !isVirat(by)) return { ...n, observers: [...n.observers, { kind: prev.kind, id: prev.id }] };
    return { ...n, supporting: [...n.supporting, { kind: prev.kind, id: prev.id }] };
  }

  addSupporting(id: string, who: Actor, by: Actor): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    const v = validateSupporting(r.value, who, by, this.directory);
    if (!v.ok) return v;
    return ok(this.save(this.ev({ ...r.value, supporting: [...r.value.supporting, v.value] }, 'supporting_changed', by, { to: v.value.id, data: { added: v.value.id } })));
  }
  removeSupporting(id: string, who: Actor, by: Actor): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    if (!r.value.supporting.some((a) => sameActor(a, who))) return fail('invalid_input', `${who.id} is not supporting this item`);
    return ok(this.save(this.ev({ ...r.value, supporting: r.value.supporting.filter((a) => !sameActor(a, who)) }, 'supporting_changed', by, { from: who.id, data: { removed: who.id } })));
  }
  addObserver(id: string, who: Actor, by: Actor): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    const v = validateObserver(r.value, who);
    if (!v.ok) return v;
    return ok(this.save(this.ev({ ...r.value, observers: [...r.value.observers, v.value] }, 'observers_changed', by, { to: v.value.id, data: { added: v.value.id } })));
  }

  // ── dependencies and links ───────────────────────────────────────────────

  /** `blocker` must finish before `blocked` can proceed. */
  addDependency(blocker: string, blocked: string, by: Actor, note?: string): Result<WorkLink> {
    if (blocker === blocked) return fail('invalid_input', 'an item cannot block itself');
    const a = this.editable(blocker), b = this.editable(blocked);
    if (!a.ok) return a;
    if (!b.ok) return b;
    if (this.links.some((l) => l.kind === 'blocks' && l.from === blocker && l.to === blocked)) return fail('invalid_input', 'that dependency already exists');
    // a cycle would mean nothing can ever start
    const seen = new Set<string>();
    const reaches = (from: string, target: string): boolean => {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return this.links.filter((l) => l.kind === 'blocks' && l.from === from).some((l) => reaches(l.to, target));
    };
    if (reaches(blocked, blocker)) return fail('invalid_input', 'that dependency would create a cycle');
    const link = this.addLink('blocks', blocker, blocked, by, note ?? null, null);
    this.save(this.ev(this.items.get(blocker)!, 'link_added', by, { data: { kind: 'blocks', blocks: blocked } }));
    this.save(this.ev(this.items.get(blocked)!, 'link_added', by, { data: { kind: 'blocks', blocked_by: blocker } }));
    return ok(link);
  }

  private addLink(kind: LinkKind, from: string, to: string, by: Actor, note: string | null, score: number | null): WorkLink {
    const l: WorkLink = { id: this.newId(), kind, from, to, at: this.now(), by, note, score };
    this.links.push(l);
    return l;
  }

  // ── deduplication: source events → one canonical item ────────────────────

  ingestSourceEvent(input: IngestInput, actor: Actor = SYSTEM): Result<IngestResult> {
    if (!SOURCE_CHANNELS.includes(input.channel)) return fail('invalid_input', `unknown channel "${input.channel}"`);
    if (blank(input.external_ref)) return fail('invalid_input', 'a source event needs its channel reference');
    if (blank(input.title)) return fail('invalid_input', 'a source event needs a title');
    if (!input.reporter?.id) return fail('invalid_input', 'a source event needs a reporter');
    if (actorIdLooksPersonal(input.reporter.id)) return fail('invalid_input', 'a reporter is a reference (e.g. external:founder:<brand>), not an email address or phone number');
    const brand = input.brand?.trim() || null;
    if (brand && this.knownBrands && !this.knownBrands.has(brand)) return fail('unknown_brand', `"${brand}" is not in the central registry`);
    const received_at = input.received_at ?? this.now();
    if (!isIso(received_at)) return fail('invalid_input', 'received_at must be a date-time');
    const candidate = { channel: input.channel, external_ref: input.external_ref.trim(), thread_ref: input.thread_ref ?? null, fingerprint: input.fingerprint ?? null, brand, title: input.title.trim(), summary: input.summary ?? '', type_hint: input.type_hint ?? null, received_at };
    const decision = matchSourceEvent(candidate, { events: this.sourceEvents, items: this.items, links: this.links }, this.dedupePolicy);

    if (decision.kind === 'duplicate_event') {
      const it = decision.existing.work_id ? this.items.get(decision.existing.work_id)! : undefined;
      return ok({ event: decision.existing, outcome: 'duplicate_event', item: rootOf(this.items, it!.id) ?? it!, candidates: [] });
    }

    const base: SourceEvent = { id: this.newId(), ...candidate, reporter: input.reporter, work_id: null, match: null };

    if (decision.kind === 'attach') {
      const it = this.items.get(decision.workId)!;
      const ev: SourceEvent = { ...base, work_id: it.id, match: { kind: 'attached', via: decision.via, score: null, candidates: [] } };
      this.sourceEvents.push(ev);
      const next = this.ev({ ...it, source_event_ids: [...it.source_event_ids, ev.id] }, 'source_attached', actor, { data: { source_event_id: ev.id, channel: ev.channel, via: decision.via } });
      this.save(next);
      return ok({ event: ev, outcome: 'attached', item: next, candidates: [] });
    }

    const scope = brand ? Scopes.brand(brand) : Scopes.devshop();
    const created = this.createItem({ type: input.type_hint ?? DEFAULT_TYPE_BY_CHANNEL[input.channel], title: candidate.title, description: candidate.summary, scope, source: { channel: input.channel, requester: input.reporter } }, actor);
    if (!created.ok) return created;
    const candidates = decision.kind === 'possible_duplicate' ? decision.candidates : [];
    const ev: SourceEvent = { ...base, work_id: created.value.id, match: { kind: candidates.length ? 'possible_duplicate' : 'created', via: candidates.length ? 'similarity' : 'new', score: candidates[0]?.score ?? null, candidates: candidates.map((c) => c.id) } };
    this.sourceEvents.push(ev);
    let item: WorkItem = { ...created.value, source_event_ids: [ev.id] };
    item = this.ev(item, 'source_attached', actor, { data: { source_event_id: ev.id, channel: ev.channel, via: 'new' } });
    for (const c of candidates) {
      this.addLink('possible_duplicate', item.id, c.id, actor, c.reason, c.score);
      item = this.ev(item, 'link_added', actor, { data: { kind: 'possible_duplicate', with: c.id, score: c.score, closed: c.closed } });
    }
    this.save(item);
    return ok({ event: ev, outcome: candidates.length ? 'possible_duplicate' : 'created', item, candidates });
  }

  /** Unresolved possible-duplicate suggestions for an item (not yet merged or ruled out). */
  possibleDuplicatesOf(id: string): WorkLink[] {
    return this.links.filter((l) => l.kind === 'possible_duplicate' && (l.from === id || l.to === id) &&
      !this.links.some((x) => (x.kind === 'not_duplicate' || x.kind === 'duplicate_of') && ((x.from === l.from && x.to === l.to) || (x.from === l.to && x.to === l.from))));
  }

  markNotDuplicate(aId: string, bId: string, by: Actor, reason: string): Result<WorkLink> {
    if (aId === bId) return fail('invalid_input', 'an item is not compared with itself');
    const a = this.load(aId), b = this.load(bId);
    if (!a.ok) return a;
    if (!b.ok) return b;
    if (blank(reason)) return fail('invalid_input', 'say why these are different issues');
    const link = this.addLink('not_duplicate', aId, bId, by, reason.trim(), null);
    this.save(this.ev(a.value, 'link_added', by, { reason, data: { kind: 'not_duplicate', with: bId } }));
    this.save(this.ev(this.items.get(bId)!, 'link_added', by, { reason, data: { kind: 'not_duplicate', with: aId } }));
    return ok(link);
  }

  /** Merge a duplicate into the canonical item. The duplicate is closed as "duplicate" and can never be reopened. */
  mergeInto(duplicateId: string, canonicalId: string, by: Actor, reason: string): Result<{ canonical: WorkItem; duplicate: WorkItem }> {
    if (duplicateId === canonicalId) return fail('merge_invalid', 'an item cannot be merged into itself');
    const d0 = this.editable(duplicateId);
    if (!d0.ok) return d0;
    const c0 = this.load(canonicalId);
    if (!c0.ok) return c0;
    const root = rootOf(this.items, canonicalId);
    if (!root) return fail('merge_invalid', 'the canonical item sits on a broken merge chain');
    if (root.id === duplicateId) return fail('merge_invalid', 'that merge would create a cycle');
    if (root.state === 'closed') return fail('merge_invalid', `${root.ref} is closed; reopen it before merging into it`);
    const dup = d0.value;
    if (blank(reason)) return fail('merge_invalid', 'a merge needs a reason (why these are the same issue)');
    if (dup.level === 'objective' || dup.level === 'initiative' || dup.level !== root.level) return fail('merge_invalid', 'only work items (or subtasks) of the same level are merged');
    if (this.children(dup.id).some((c) => c.state !== 'closed')) return fail('merge_invalid', 'the duplicate has open subordinate items');
    if ((dup.scope.brand ?? null) !== (root.scope.brand ?? null) && !isPlatformScope(root.scope)) {
      return fail('merge_invalid', 'reports from different brands merge only into a DevShop or Retail OS platform item');
    }

    const at = this.now();
    let canon: WorkItem = { ...root };
    const adds: string[] = [];
    // The duplicate's people stay informed on the canonical item. Prince only ever joins via Virat.
    const people: Actor[] = [...(dup.owner ? [dup.owner] : []), ...dup.supporting];
    for (const a of people) {
      if (sameActor(canon.owner, a) || canon.supporting.some((x) => sameActor(x, a)) || canon.observers.some((x) => sameActor(x, a))) continue;
      if (isPrince(a) && !isVirat(by)) canon = { ...canon, observers: [...canon.observers, { kind: a.kind, id: a.id }] };
      else canon = { ...canon, supporting: [...canon.supporting, { kind: a.kind, id: a.id }] };
      adds.push(a.id);
    }
    for (const o of dup.observers) if (!sameActor(canon.owner, o) && !canon.supporting.some((x) => sameActor(x, o)) && !canon.observers.some((x) => sameActor(x, o))) canon = { ...canon, observers: [...canon.observers, o] };
    const carried = dup.evidence.filter((e) => !canon.evidence.some((x) => x.id === e.id));
    canon = { ...canon, evidence: [...canon.evidence, ...carried], source_event_ids: uniq([...canon.source_event_ids, ...dup.source_event_ids]) };
    const data: Record<string, unknown> = { duplicate: dup.id, duplicate_ref: dup.ref, people_added: adds, evidence_carried: carried.length };
    // the merged item is at least as urgent as the more urgent of the two reports
    if (dup.priority && (!canon.priority || moreUrgent(dup.priority, canon.priority) !== canon.priority)) {
      data.priority_from = canon.priority; data.priority_to = dup.priority; canon = { ...canon, priority: dup.priority };
    }
    if (dup.deadline && (!canon.deadline || Date.parse(dup.deadline.at) < Date.parse(canon.deadline.at))) { data.deadline_from = canon.deadline; canon = { ...canon, deadline: dup.deadline }; }
    canon = this.ev(canon, 'merged_from', by, { reason, data });

    this.sourceEvents = this.sourceEvents.map((e) => (e.work_id === dup.id ? { ...e, work_id: canon.id } : e));
    for (const l of this.links.filter((x) => x.kind === 'blocks' && (x.from === dup.id || x.to === dup.id))) {
      const from = l.from === dup.id ? canon.id : l.from, to = l.to === dup.id ? canon.id : l.to;
      if (from !== to && !this.links.some((x) => x.kind === 'blocks' && x.from === from && x.to === to)) this.addLink('blocks', from, to, by, 'inherited from a merged duplicate', null);
    }
    this.addLink('duplicate_of', dup.id, canon.id, by, reason, null);

    const evidence: Evidence = { id: this.newId(), at, by, kind: 'link', ref: canon.ref, summary: `merged into ${canon.ref}: ${reason.trim()}` };
    let dupNext: WorkItem = {
      ...dup, evidence: [...dup.evidence, evidence], state: 'closed', held_from: null, waiting: null, blocked: null, merged_into: canon.id, closed_at: at,
      resolution: { kind: 'duplicate', summary: reason.trim(), by, at, merged_into: canon.id },
      closure: { verified_by: by, verified_at: at, method: 'merged into the canonical item', evidence_ids: [evidence.id] },
    };
    dupNext = this.ev(dupNext, 'state_change', by, { from: dup.state, to: 'closed', reason, data: { merge: true, merged_into: canon.id } });
    dupNext = this.ev(dupNext, 'merged_into', by, { reason, data: { canonical: canon.id, canonical_ref: canon.ref } });
    this.save(canon);
    this.save(dupNext);
    this.releaseLocksFor(dup.id, by, 'merged as a duplicate');
    return ok({ canonical: this.items.get(canon.id)!, duplicate: this.items.get(dup.id)! });
  }

  // ── repository work ──────────────────────────────────────────────────────

  /** The five checks before material repository work: existing work, owner, dependencies, lock, PR/branch. */
  preflight(scope: RepoScope, workId: string | null = null): PreflightReport {
    this.sweepLocks();
    return preflight(scope, workId, { items: [...this.items.values()], links: this.links, locks: this.locks }, this.lockPolicy, this.now());
  }

  acquireLock(workId: string, scope: RepoScope, by: Actor, opts: { ttlMs?: number } = {}): Result<RepoLock> {
    this.sweepLocks();
    const r = this.editable(workId);
    if (!r.ok) return r;
    const it = r.value;
    if (!it.owner || !ACTIVE_OWNED.includes(it.state)) return fail('owner_required', 'a lock needs an assigned item with an accountable owner');
    if (!sameActor(it.owner, by) && !it.supporting.some((a) => sameActor(a, by))) return fail('not_permitted', 'only the accountable owner or a supporting agent takes the lock');
    if (blank(scope.repository)) return fail('invalid_input', 'a repository is required');
    if (!scope.material) return fail('invalid_input', 'only material (writing) work takes a lock');
    if (this.activeLockFor(workId)) return fail('lock_not_allowed', 'this item already holds a lock; renew or release it first');
    const conflicts = findConflicts(scope, this.locks, this.lockPolicy, this.now(), workId);
    if (conflicts.length) {
      const owners = conflicts.map((c) => `${this.items.get(c.work_id)?.ref ?? c.work_id} (${c.lock_owner.id})`);
      return fail('repo_conflict', `another item already holds a conflicting lock: ${owners.join(', ')}`, { conflicts: conflicts.map((c) => c.id) });
    }
    const ttl = opts.ttlMs ?? this.lockPolicy.defaultTtlMs;
    if (!(ttl > 0)) return fail('invalid_input', 'a lock needs a positive lifetime');
    const at = this.now();
    const lock: RepoLock = {
      id: this.newId(), work_id: workId, repository: scope.repository, branch: scope.branch ?? null, worktree: scope.worktree ?? null,
      paths: [...scope.paths], deployment_target: scope.deployment_target ?? null, lock_owner: by, acquired_at: at,
      expires_at: new Date(Date.parse(at) + ttl).toISOString(), released_at: null, released_reason: null, released_by: null,
    };
    this.locks.push(lock);
    this.save(this.ev({ ...it, repo_scope: { ...scope, paths: [...scope.paths] } }, 'lock_acquired', by, { data: { lock_id: lock.id, repository: lock.repository, branch: lock.branch, paths: lock.paths, expires_at: lock.expires_at } }));
    return ok(lock);
  }

  renewLock(lockId: string, by: Actor, ttlMs?: number): Result<RepoLock> {
    this.sweepLocks();
    const l = this.locks.find((x) => x.id === lockId);
    if (!l || l.released_at !== null) return fail('lock_not_found', 'no active lock with that id');
    if (!sameActor(l.lock_owner, by)) return fail('not_permitted', 'only the lock owner renews it');
    const ttl = ttlMs ?? this.lockPolicy.defaultTtlMs;
    const renewed = { ...l, expires_at: new Date(Date.parse(this.now()) + ttl).toISOString() };
    this.locks = this.locks.map((x) => (x.id === lockId ? renewed : x));
    this.save(this.ev(this.items.get(l.work_id)!, 'lock_renewed', by, { data: { lock_id: lockId, expires_at: renewed.expires_at } }));
    return ok(renewed);
  }

  releaseLock(lockId: string, by: Actor, reason: string): Result<RepoLock> {
    this.sweepLocks();
    const l = this.locks.find((x) => x.id === lockId);
    if (!l || l.released_at !== null) return fail('lock_not_found', 'no active lock with that id');
    const it = this.items.get(l.work_id);
    if (!sameActor(l.lock_owner, by) && !sameActor(it?.owner, by)) return fail('not_permitted', 'only the lock owner or the item owner releases a lock');
    if (blank(reason)) return fail('invalid_input', 'say why the lock is released');
    const released = { ...l, released_at: this.now(), released_reason: reason.trim(), released_by: by };
    this.locks = this.locks.map((x) => (x.id === lockId ? released : x));
    if (it) this.save(this.ev(it, 'lock_released', by, { reason, data: { lock_id: lockId } }));
    return ok(released);
  }

  /** Only Virat or Prince may break someone else's lock (a stuck agent), with a reason on the record. */
  breakLock(lockId: string, by: Actor, reason: string): Result<RepoLock> {
    this.sweepLocks();
    const l = this.locks.find((x) => x.id === lockId);
    if (!l || l.released_at !== null) return fail('lock_not_found', 'no active lock with that id');
    if (!(isVirat(by) || (by.kind === 'human' && isPrince(by)))) return fail('not_permitted', 'only Virat or Prince breaks a lock');
    if (blank(reason)) return fail('invalid_input', 'breaking a lock needs a reason');
    const broken = { ...l, released_at: this.now(), released_reason: `broken: ${reason.trim()}`, released_by: by };
    this.locks = this.locks.map((x) => (x.id === lockId ? broken : x));
    const it = this.items.get(l.work_id);
    if (it) this.save(this.ev(it, 'lock_broken', by, { reason, data: { lock_id: lockId, was_held_by: l.lock_owner.id } }));
    return ok(broken);
  }

  // ── escalation ───────────────────────────────────────────────────────────

  /** Lateral: straight to the specialist. Accountability moves; the previous owner stays on. */
  escalateLateral(id: string, to: Actor, by: Actor, reason: string): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    const it = r.value;
    if (!it.owner || !ACTIVE_OWNED.includes(it.state)) return fail('owner_required', 'lateral escalation applies to an assigned item');
    if (!sameActor(it.owner, by) && !it.supporting.some((a) => sameActor(a, by)) && !isVirat(by)) return fail('not_permitted', 'the owner, a supporting agent or Virat escalates');
    if (blank(reason)) return fail('escalation_incomplete', 'say why this goes to the specialist');
    // a supporting specialist can be promoted; take them out of that role first
    const without: WorkItem = { ...it, supporting: it.supporting.filter((a) => !sameActor(a, to)) };
    const v = validateOwner(without, to, by, this.directory);
    if (!v.ok) return v;
    const esc: Escalation = { id: this.newId(), kind: 'lateral', at: this.now(), from: it.owner, to: v.value, reason: reason.trim() };
    let n: WorkItem = { ...without, owner: v.value, escalations: [...it.escalations, esc] };
    n = this.demoteToSupporting(n, it.owner, by);
    n = this.ev(n, 'escalated_lateral', by, { from: it.owner.id, to: v.value.id, reason, data: { escalation_id: esc.id } });
    n = this.ev(n, 'owner_assigned', by, { from: it.owner.id, to: v.value.id, reason: 'lateral escalation' });
    return ok(this.save(n));
  }

  /** Human: authority or coverage is missing. Captures everything the human needs; the item holds until they answer. */
  escalateToHuman(id: string, input: HumanEscalationInput, by: Actor): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    const it = r.value;
    if (!it.owner) return fail('owner_required', 'a human escalation is raised by the accountable owner of an assigned item');
    if (!sameActor(it.owner, by) && !it.supporting.some((a) => sameActor(a, by)) && !isVirat(by)) return fail('not_permitted', 'the owner, a supporting agent or Virat escalates to a human');
    const v = validateHumanEscalation(input, by);
    if (!v.ok) return v;
    const unknown = input.evidence_ids.filter((e) => !it.evidence.some((x) => x.id === e));
    if (unknown.length) return fail('escalation_incomplete', `unknown evidence ${unknown.join(', ')}`);
    const esc: Escalation = { id: this.newId(), kind: 'human', at: this.now(), owner: it.owner, to: input.to, coverage_gap: input.coverage_gap, what_happened: input.what_happened.trim(), evidence_ids: input.evidence_ids, impact: input.impact.trim(), risk: input.risk.trim(), tried: input.tried.filter((t) => t.trim()).map((t) => t.trim()), decision_required: input.decision_required.trim(), recommended_action: input.recommended_action.trim() };
    let n: WorkItem = { ...it, escalations: [...it.escalations, esc] };
    n = this.ev(n, 'escalated_human', by, { to: input.to, data: { escalation_id: esc.id, coverage_gap: input.coverage_gap, decision_required: esc.decision_required } });
    this.save(n);
    // The item holds while the human answers (unless it is already held or finished).
    if (n.state === 'triaged' || n.state === 'assigned' || n.state === 'in_progress') {
      const t = this.transition(id, 'waiting', by, { payload: { waiting: { on: coverageLabel(input.to) } }, reason: `escalated to ${coverageLabel(input.to)}` });
      if (!t.ok) return t;
    }
    return ok(this.items.get(id)!);
  }

  // ── approvals ────────────────────────────────────────────────────────────

  requestApproval(id: string, input: ApprovalRequestInput, by: Actor): Result<WorkItem> {
    const r = this.editable(id);
    if (!r.ok) return r;
    const it = r.value;
    if (!it.owner || !(sameActor(it.owner, by) || it.supporting.some((a) => sameActor(a, by)) || isVirat(by))) return fail('not_permitted', 'the accountable owner or a supporting agent requests approval');
    const v = validateApprovalRequest(input);
    if (!v.ok) return v;
    const unknown = input.evidence_ids.filter((e) => !it.evidence.some((x) => x.id === e));
    if (unknown.length) return fail('approval_invalid', `unknown evidence ${unknown.join(', ')}`);
    const approval: Approval = { id: this.newId(), requested_by: by, requested_from: input.requested_from, authority: input.authority, reason: input.reason.trim(), evidence_ids: input.evidence_ids, recommendation: input.recommendation.trim(), requested_at: this.now(), decision: null };
    const withReq = this.ev({ ...it, approval }, 'approval_requested', by, { to: input.requested_from, data: { approval_id: approval.id, authority: input.authority, reason: approval.reason, recommendation: approval.recommendation } });
    const res = applyTransition(withReq, { to: 'pending_approval', actor: by, at: this.now(), reason: `approval requested from ${input.requested_from}`, newId: this.newId }, this.ctxFor(withReq));
    if (!res.ok) return res; // nothing saved: the request only exists if the item could actually hold for it
    return ok(this.save(res.value));
  }

  /** Records the decision (kept in the audit trail) and returns the item to where it was held from. */
  decideApproval(id: string, outcome: ApprovalDecision['outcome'], by: Actor, note?: string): Result<{ item: WorkItem; resumed: boolean; resumeError?: string }> {
    const r = this.load(id);
    if (!r.ok) return r;
    const it = r.value;
    if (it.state !== 'pending_approval' || !it.approval || it.approval.decision) return fail('approval_invalid', 'there is no pending approval on this item');
    if (outcome !== 'approved' && outcome !== 'rejected') return fail('approval_invalid', 'a decision is approved or rejected');
    if (outcome === 'rejected' && blank(note)) return fail('approval_invalid', 'a rejection needs a note saying why');
    const v = validateDecision(it.approval, by, it.scope);
    if (!v.ok) return v;
    const decision: ApprovalDecision = { outcome, by, at: this.now(), note: note?.trim() || null };
    const decided = this.ev({ ...it, approval: { ...it.approval, decision } }, 'approval_decided', by, { from: 'pending', to: outcome, reason: decision.note, data: { approval_id: it.approval.id, authority: it.approval.authority, requested_from: it.approval.requested_from } });
    this.save(decided);
    const target = decided.held_from ?? 'in_progress';
    const t = this.transition(id, target, by, { reason: `approval ${outcome}` });
    return ok({ item: this.items.get(id)!, resumed: t.ok, ...(t.ok ? {} : { resumeError: t.error.message }) });
  }

  // ── convenience ──────────────────────────────────────────────────────────

  /** The org-level view Virat needs without chasing: open items waiting on a human, by who. */
  awaitingHuman(): { coverage: HumanCoverage; items: WorkItem[] }[] {
    const by = new Map<HumanCoverage, WorkItem[]>();
    for (const i of this.items.values()) {
      if (i.merged_into || i.state === 'closed') continue;
      const open = i.approval && !i.approval.decision && i.state === 'pending_approval' ? i.approval.requested_from : null;
      const esc = [...i.escalations].reverse().find((e): e is Extract<Escalation, { kind: 'human' }> => e.kind === 'human');
      const who = open ?? (i.state === 'waiting' && esc ? esc.to : null);
      if (who) by.set(who, [...(by.get(who) ?? []), i]);
    }
    return [...by.entries()].map(([coverage, items]) => ({ coverage, items }));
  }
}

