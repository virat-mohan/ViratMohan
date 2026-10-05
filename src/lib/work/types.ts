// Work Registry: the ONE canonical work object for DevShop, Retail OS, every brand,
// founders, agents, incidents, support, alerts, improvements and opportunities.
//
// This folder is pure and self-contained: no Astro, no Supabase, no network, no imports from
// outside it (a test enforces that). It can be lifted into a shared package unchanged when a
// second repository needs it. Nothing in the live stores or the live control-plane pages
// imports it (a test enforces that too): it is a tested foundation, not a rollout.

// ── Vocabulary ──────────────────────────────────────────────────────────────

/** OBJECTIVE → INITIATIVE → WORK ITEM → SUBTASK. An ACTION is a logged step on any item (an event), not a level. */
export const WORK_LEVELS = ['objective', 'initiative', 'work_item', 'subtask'] as const;
export type WorkLevel = (typeof WORK_LEVELS)[number];

export const WORK_TYPES = ['request', 'incident', 'support', 'alert', 'improvement', 'opportunity', 'task'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

/** NEW → TRIAGED → ASSIGNED → IN PROGRESS → WAITING / BLOCKED / PENDING APPROVAL → RESOLVED → VERIFICATION → CLOSED → REOPENED. */
export const WORK_STATES = [
  'new', 'triaged', 'assigned', 'in_progress', 'waiting', 'blocked', 'pending_approval',
  'resolved', 'verification', 'closed', 'reopened',
] as const;
export type WorkState = (typeof WORK_STATES)[number];

/** P0 Critical, P1 Urgent, P2 Important, P3 Normal, P4 Backlog / Improvement. */
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Whose work it is. Not separate ticket systems: one field on one object. */
export const SCOPE_KINDS = ['devshop', 'retail_os', 'brand', 'client_extension', 'founder'] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];

export interface Scope {
  kind: ScopeKind;
  /** Brand key (matches the central registry `brands.key`). Required for brand and client_extension. */
  brand: string | null;
  /** Founder reference. Required for founder work. */
  founder: string | null;
  /** Product / system the work is about (e.g. "storefront", "control-plane"). Free key, optional. */
  system: string | null;
  /** client_extension only: the extension module key. */
  extension: string | null;
}

export const SOURCE_CHANNELS = [
  'command_centre', 'brand_support_email', 'whatsapp', 'founder_request', 'agent_detection', 'system_alert', 'internal',
] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

// ── People and agents ──────────────────────────────────────────────────────

/**
 * Who did or owns something. `id` is an `org_members.id` (DS-00, TC-01, P-01 …) for agents and
 * for the two people in the org, `external:<who>` for humans outside it (accountants, legal
 * advisers, a brand founder), `system:<name>` for automation. Never a raw phone number or email.
 * `passport` is the future Agent Passport reference; unused today.
 */
export type ActorKind = 'agent' | 'human' | 'external' | 'system';
export interface Actor { kind: ActorKind; id: string; passport?: string | null }

/** The only human coverage there is. No new human owners are invented. */
export const HUMAN_COVERAGE = ['virat', 'prince', 'khiwani', 'legal', 'brand_founder'] as const;
export type HumanCoverage = (typeof HUMAN_COVERAGE)[number];

/** What an approval is about. Mapped to who may decide it in actors.ts. */
export const AUTHORITIES = [
  'money', 'pricing', 'outbound_comms', 'social_post', 'prince_assignment', 'expansion', 'terms_legal',
  'irreversible', 'strategic', 'accounting_tax', 'legal_opinion', 'brand_judgement', 'technical_deployment',
] as const;
export type Authority = (typeof AUTHORITIES)[number];

// ── Evidence, risk, numbers ────────────────────────────────────────────────

export const EVIDENCE_KINDS = ['link', 'log', 'screenshot', 'metric', 'test', 'pr', 'deploy', 'message', 'note'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export interface Evidence { id: string; at: string; by: Actor; kind: EvidenceKind; ref: string; summary: string }
export type EvidenceInput = Omit<Evidence, 'id' | 'at' | 'by'>;

/** A number with its provenance. Real numbers only: a measured value needs a source; unknown is allowed, invented is not. */
export interface Quantified {
  value: number | null;
  unit: string;
  basis: 'measured' | 'estimated' | 'unknown';
  source: string | null;
  note?: string | null;
}

export type RiskLevel = 'none' | 'low' | 'high' | 'critical';
export interface Risk { level: RiskLevel; note: string | null; quantified?: Quantified | null }

/** The agreed priority factors. Levels, not a score. */
export interface PriorityFactors {
  customerHarm: RiskLevel;
  revenueProfitRisk: RiskLevel;
  security: RiskLevel;
  operationalDisruption: RiskLevel;
  promiseRisk: 'none' | 'soon' | 'at_risk' | 'breached';
  strategic: 'none' | 'supports' | 'core';
  /** The most urgent priority among open items this one blocks (the dependency factor). */
  blocksPriority?: Priority | null;
}

export interface Deadline { at: string; kind: 'promise' | 'target'; promised_to: string | null }

// ── Lifecycle records ──────────────────────────────────────────────────────

export const RESOLUTION_KINDS = ['fixed', 'workaround', 'completed', 'declined', 'wont_do', 'not_reproducible', 'duplicate'] as const;
export type ResolutionKind = (typeof RESOLUTION_KINDS)[number];
export interface Resolution { kind: ResolutionKind; summary: string; by: Actor; at: string; merged_into?: string | null }

/** Closure needs verification: who checked, how, and the evidence they saw. RESOLVED is not CLOSED. */
export interface Closure { verified_by: Actor; verified_at: string; method: string; evidence_ids: string[] }

export interface Learning { lesson: string; reference: string | null; rule_added: boolean }

export interface Waiting { on: string; until: string | null; since: string }
export interface Blocked { reason: string | null; since: string }

export interface ApprovalDecision { outcome: 'approved' | 'rejected'; by: Actor; at: string; note: string | null }
export interface Approval {
  id: string;
  requested_by: Actor;
  requested_from: HumanCoverage;
  authority: Authority;
  reason: string;
  evidence_ids: string[];
  recommendation: string;
  requested_at: string;
  decision: ApprovalDecision | null;
}

export interface LateralEscalation { id: string; kind: 'lateral'; at: string; from: Actor; to: Actor; reason: string }
export interface HumanEscalation {
  id: string; kind: 'human'; at: string;
  /** The accountable owner who raised it (still accountable). */
  owner: Actor;
  to: HumanCoverage;
  coverage_gap: 'authority' | 'coverage';
  what_happened: string;
  evidence_ids: string[];
  impact: string;
  risk: string;
  tried: string[];
  decision_required: string;
  recommended_action: string;
}
export type Escalation = LateralEscalation | HumanEscalation;

/** Material software work: where, on what, and (via a lock) who is allowed to write. */
export interface RepoScope {
  repository: string;
  branch: string | null;
  worktree: string | null;
  /** Files or directories in scope. Empty means the whole repository. */
  paths: string[];
  deployment_target: string | null;
  pr: string | null;
  /** Material = writes to the repository. Only material work takes a lock. */
  material: boolean;
}

export interface RepoLock {
  id: string;
  work_id: string;
  repository: string;
  branch: string | null;
  worktree: string | null;
  paths: string[];
  deployment_target: string | null;
  lock_owner: Actor;
  acquired_at: string;
  expires_at: string;
  released_at: string | null;
  released_reason: string | null;
  released_by: Actor | null;
}

export interface IncidentTest { description: string; result: 'pass' | 'fail' | 'inconclusive'; evidence_id: string | null }
export interface IncidentPrevention { action: string; work_id: string | null }
/**
 * An incident is a Work item with type "incident" plus this record: PROBLEM (the description) →
 * DIAGNOSIS → OWNER → ACTIONS → EVIDENCE → TEST → RESULT → COST → REVENUE IMPACT → CUSTOMER IMPACT
 * → DECISION → LEARNING → PREVENTION. Owner, actions, evidence, customer impact and learning are
 * the generic fields of every item; this holds the rest.
 */
export interface IncidentRecord {
  diagnosis: string | null;
  tests: IncidentTest[];
  result: string | null;
  cost: Quantified | null;
  revenue_impact: Quantified | null;
  decision: { decision: string; by: Actor; at: string } | null;
  prevention: IncidentPrevention[];
}

// ── Audit ───────────────────────────────────────────────────────────────────

export const EVENT_KINDS = [
  'created', 'state_change', 'field_change', 'priority_set', 'owner_assigned', 'supporting_changed', 'observers_changed',
  'evidence_added', 'action', 'source_attached', 'link_added', 'merged_into', 'merged_from',
  'lock_acquired', 'lock_released', 'lock_renewed', 'lock_broken',
  'approval_requested', 'approval_decided', 'escalated_lateral', 'escalated_human', 'incident_updated',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Append-only, hash-chained. Editing, removing or reordering any entry breaks the chain. */
export interface WorkEvent {
  seq: number;
  at: string;
  actor: Actor;
  kind: EventKind;
  from: string | null;
  to: string | null;
  reason: string | null;
  data: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

// ── The work object ─────────────────────────────────────────────────────────

export interface WorkItem {
  /** Work ID. */
  id: string;
  /** Short human reference (W-0001), assigned by the registry. */
  ref: string;
  level: WorkLevel;
  parent_id: string | null;
  type: WorkType;
  title: string;
  description: string;
  scope: Scope;
  /** Source / channel the work first arrived through, and who asked. */
  source: { channel: SourceChannel; requester: Actor };
  priority: Priority | null;
  priority_factors: PriorityFactors | null;
  priority_reason: string | null;
  state: WorkState;
  /** The state a hold (waiting / blocked / pending approval) was entered from, so it can resume there. */
  held_from: WorkState | null;
  /** Exactly one accountable owner from ASSIGNED onward. */
  owner: Actor | null;
  supporting: Actor[];
  observers: Actor[];
  created_at: string;
  updated_at: string;
  deadline: Deadline | null;
  customer_impact: string | null;
  revenue_profit_risk: Risk | null;
  security_risk: Risk | null;
  evidence: Evidence[];
  waiting: Waiting | null;
  blocked: Blocked | null;
  approval: Approval | null;
  escalations: Escalation[];
  repo_scope: RepoScope | null;
  incident: IncidentRecord | null;
  resolution: Resolution | null;
  closure: Closure | null;
  learning: Learning | null;
  closed_at: string | null;
  reopen_count: number;
  /** Set when this item was merged into a canonical one as a duplicate. */
  merged_into: string | null;
  /** The source events (reports) that resolve to this item. */
  source_event_ids: string[];
  events: WorkEvent[];
}

// ── Links, source events, results ──────────────────────────────────────────

export const LINK_KINDS = ['blocks', 'duplicate_of', 'possible_duplicate', 'not_duplicate', 'relates'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
/** `blocks`: `from` must finish before `to`. `duplicate_of`: `from` was merged into `to`. */
export interface WorkLink { id: string; kind: LinkKind; from: string; to: string; at: string; by: Actor; note: string | null; score: number | null }

export interface SourceEvent {
  id: string;
  channel: SourceChannel;
  /** The channel's own id for the message / alert. With `channel`, makes ingestion idempotent. */
  external_ref: string;
  thread_ref: string | null;
  /** Stable key a detector gives to the same underlying issue (e.g. a health-check name + brand). */
  fingerprint: string | null;
  received_at: string;
  reporter: Actor;
  brand: string | null;
  title: string;
  summary: string;
  type_hint: WorkType | null;
  work_id: string | null;
  match: { kind: 'created' | 'attached' | 'possible_duplicate'; via: 'new' | 'thread' | 'fingerprint' | 'similarity'; score: number | null; candidates: string[] } | null;
}

export type ErrorCode =
  | 'invalid_input' | 'not_found' | 'illegal_transition' | 'closed_item' | 'merged_duplicate'
  | 'triage_incomplete' | 'priority_override_needs_reason' | 'owner_required' | 'owner_invalid' | 'role_conflict' | 'prince_requires_virat'
  | 'blocker_required' | 'still_blocked' | 'waiting_on_required' | 'approval_required' | 'approval_decision_required'
  | 'approval_invalid' | 'approval_not_allowed' | 'resolution_required' | 'children_open' | 'incident_incomplete'
  | 'verification_required' | 'verifier_must_differ' | 'learning_required' | 'prevention_required' | 'reopen_reason_required'
  | 'repo_lock_required' | 'lock_held' | 'repo_conflict' | 'lock_not_found' | 'lock_not_allowed' | 'scope_invalid' | 'hierarchy_invalid'
  | 'merge_invalid' | 'not_permitted' | 'escalation_incomplete' | 'unknown_brand' | 'chain_broken';

export interface WorkError { code: ErrorCode; message: string; details?: unknown }
export type Result<T> = { ok: true; value: T } | { ok: false; error: WorkError };
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: ErrorCode, message: string, details?: unknown): { ok: false; error: WorkError } => ({ ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } });
