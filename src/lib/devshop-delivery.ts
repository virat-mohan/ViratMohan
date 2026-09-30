// Stage 5C — Custom Build delivery control. Makes the post-deposit delivery lifecycle explicit,
// gated and auditable WITHOUT a migration: it reuses the existing pipeline status on `submissions`
// and the existing `stage_transitions` audit trail. The fine lifecycle (QA → client review →
// revision → acceptance → go-live) is derived deterministically from canonical transition events
// we record in stage_transitions.reason. No LLM decides any of this; no state auto-advances.

// Canonical event tags written as the leading token of stage_transitions.reason, e.g.
// "QA_FAILED: checkout errored on COD". Everything downstream keys off the tag, never free text.
export const DELIVERY_EVENTS = [
  'BUILD_STARTED', 'BUILD_BLOCKED', 'BUILD_READY_FOR_QA',
  'QA_PASSED', 'QA_FAILED',
  'CLIENT_REVIEW_SENT', 'CHANGES_REQUESTED', 'REVISION_COMPLETED',
  'BUILD_ACCEPTED', 'GO_LIVE_APPROVED',
] as const;
export type DeliveryEvent = (typeof DELIVERY_EVENTS)[number];

// Deterministic internal-QA checklist for a Custom Build. Internal QA ≠ client acceptance: this is
// DevShop confirming the build is ready to show the client. QA passes only when every applicable
// item is confirmed; items genuinely not relevant to a given build are marked 'na'.
export const QA_CHECKLIST = [
  { key: 'core_functionality', label: 'Core requested functionality works' },
  { key: 'critical_workflow', label: 'Critical end-to-end workflow tested' },
  { key: 'auth_permissions', label: 'Authentication / permissions correct where relevant' },
  { key: 'integrations', label: 'Integrations for this build verified' },
  { key: 'error_states', label: 'Obvious error states handled' },
  { key: 'customer_surface', label: 'Customer-facing surfaces reviewed' },
  { key: 'deploy_health', label: 'Deployment / build health checked' },
  { key: 'security_sensitive', label: 'Security-sensitive functionality checked' },
  { key: 'data_integrity', label: 'Data integrity verified where relevant' },
  { key: 'responsive', label: 'Mobile / responsive behaviour checked' },
  { key: 'acceptance_criteria', label: 'Known acceptance criteria met' },
] as const;
export type QaResult = Record<string, 'pass' | 'fail' | 'na'>;

/** QA passes only when no item failed and every item has an explicit result (pass or na). Deterministic. */
export function evaluateQa(results: QaResult): { passed: boolean; failed: string[]; missing: string[] } {
  const failed = QA_CHECKLIST.filter((i) => results[i.key] === 'fail').map((i) => i.key);
  const missing = QA_CHECKLIST.filter((i) => results[i.key] !== 'pass' && results[i.key] !== 'fail' && results[i.key] !== 'na').map((i) => i.key);
  return { passed: failed.length === 0 && missing.length === 0, failed, missing };
}

export type DeliveryStatus =
  | 'READY_FOR_BUILD' | 'BUILDING' | 'INTERNAL_QA' | 'CLIENT_REVIEW' | 'REVISION'
  | 'READY_FOR_ACCEPTANCE' | 'ACCEPTED' | 'READY_FOR_GO_LIVE' | 'LIVE' | 'BLOCKED';

export type Transition = { new_status: string; actor: string; reason: string | null; created_at: string };

const tagOf = (t: Transition): DeliveryEvent | null => {
  const tag = (t.reason ?? '').split(/[:\s]/, 1)[0];
  return (DELIVERY_EVENTS as readonly string[]).includes(tag) ? (tag as DeliveryEvent) : null;
};

/** Delivery events oldest→newest (stage_transitions is stored newest-first). */
export function deliveryEvents(transitions: Transition[]): { tag: DeliveryEvent; t: Transition }[] {
  return transitions
    .map((t) => ({ tag: tagOf(t), t }))
    .filter((x): x is { tag: DeliveryEvent; t: Transition } => x.tag !== null)
    .sort((a, b) => a.t.created_at.localeCompare(b.t.created_at));
}

const last = <T,>(arr: T[]) => (arr.length ? arr[arr.length - 1] : null);

export type DeliveryRecord = {
  status: DeliveryStatus;
  revision: number;              // completed build revisions so far
  qaPassedForCurrentBuild: boolean;
  clientReviewSent: boolean;
  changesOutstanding: boolean;
  accepted: boolean;
  live: boolean;
  blocker: string | null;
  nextAction: string;
};

/**
 * Deterministic delivery record from the pipeline status + the canonical transition events.
 * Pure: no I/O, no LLM. `pipelineStatus` is submissions.status.
 */
export function deliveryRecord(pipelineStatus: string, transitions: Transition[]): DeliveryRecord {
  const evs = deliveryEvents(transitions);
  const tags = evs.map((e) => e.tag);
  const revision = tags.filter((t) => t === 'REVISION_COMPLETED').length;
  const live = tags.includes('GO_LIVE_APPROVED');

  // "Current build" resets whenever the build (re)starts: BUILD_STARTED or REVISION_COMPLETED.
  const lastBuildIdx = Math.max(tags.lastIndexOf('BUILD_STARTED'), tags.lastIndexOf('REVISION_COMPLETED'));
  const qaSince = evs.slice(lastBuildIdx + 1).map((e) => e.tag).filter((t) => t === 'QA_PASSED' || t === 'QA_FAILED');
  const qaPassedForCurrentBuild = last(qaSince) === 'QA_PASSED';

  // Latest of the review/changes pair decides the review sub-state.
  const reviewPair = tags.filter((t) => t === 'CLIENT_REVIEW_SENT' || t === 'CHANGES_REQUESTED');
  const clientReviewSent = last(reviewPair) === 'CLIENT_REVIEW_SENT';
  const changesOutstanding = last(reviewPair) === 'CHANGES_REQUESTED';

  // Accepted only if BUILD_ACCEPTED is the latest acceptance-relevant event (a later CHANGES_REQUESTED reopens it).
  const acceptPair = tags.filter((t) => t === 'BUILD_ACCEPTED' || t === 'CHANGES_REQUESTED');
  const accepted = last(acceptPair) === 'BUILD_ACCEPTED';

  const lastBlockable = last(tags.filter((t) => t === 'BUILD_BLOCKED' || t === 'BUILD_STARTED' || t === 'REVISION_COMPLETED' || t === 'QA_PASSED'));
  const blocked = lastBlockable === 'BUILD_BLOCKED';
  const blocker = blocked ? ((): string => { const b = [...evs].reverse().find((e) => e.tag === 'BUILD_BLOCKED'); return b?.t.reason ?? 'Blocked'; })() : null;

  let status: DeliveryStatus;
  let nextAction: string;
  if (blocked) { status = 'BLOCKED'; nextAction = 'Resolve the blocker, then resume the build'; }
  else if (live) { status = 'LIVE'; nextAction = 'None — build is live'; }
  else if (accepted) { status = 'READY_FOR_GO_LIVE'; nextAction = 'Human go-live approval required'; }
  else if (changesOutstanding) { status = 'REVISION'; nextAction = 'Complete the requested revision, then re-run internal QA'; }
  else if (clientReviewSent && qaPassedForCurrentBuild) { status = 'READY_FOR_ACCEPTANCE'; nextAction = 'Await explicit client acceptance'; }
  else if (qaPassedForCurrentBuild) { status = 'CLIENT_REVIEW'; nextAction = 'Send the build to the client for review'; }
  else if (tags.includes('BUILD_READY_FOR_QA') || pipelineStatus === 'uat') { status = 'INTERNAL_QA'; nextAction = 'Run internal QA; a failed check blocks client review'; }
  else if (pipelineStatus === 'in_build' || tags.includes('BUILD_STARTED')) { status = 'BUILDING'; nextAction = 'Finish the build, then mark ready for QA'; }
  else { status = 'READY_FOR_BUILD'; nextAction = 'Start the build'; }

  return { status, revision, qaPassedForCurrentBuild, clientReviewSent, changesOutstanding, accepted, live, blocker, nextAction };
}

// ── Deterministic guards enforced by the admin route ────────────────────────────────────────────
// Each returns null if allowed, or a short reason string if not.

/** QA failure blocks client review: you may only send for review when QA has passed for the current build. */
export function canSendForReview(rec: DeliveryRecord): string | null {
  if (rec.live) return 'Build is already live';
  if (rec.accepted) return 'Build already accepted';
  if (!rec.qaPassedForCurrentBuild) return 'Internal QA has not passed for the current build';
  return null;
}

/** Acceptance requires the build to be with the client and no outstanding changes. Never auto-set. */
export function canAccept(rec: DeliveryRecord): string | null {
  if (rec.accepted) return 'Already accepted';
  if (rec.changesOutstanding) return 'Changes were requested; revise and re-review first';
  if (!rec.clientReviewSent) return 'Build has not been sent to the client for review';
  if (!rec.qaPassedForCurrentBuild) return 'Internal QA has not passed for the current build';
  return null;
}

/** Go-live is separate from acceptance and requires an accepted build. Human-approved only. */
export function canGoLive(rec: DeliveryRecord): string | null {
  if (rec.live) return 'Already live';
  if (!rec.accepted) return 'Build has not been accepted by the client';
  return null;
}
