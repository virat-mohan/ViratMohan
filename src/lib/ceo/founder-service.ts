// Founder Command Centre → CEO runtime, server side only.
// The browser sends text; this loads the real Work Registry, runs the deterministic orchestrator, persists only
// when the orchestrator mutated something, and returns a structured response. No LLM, no outbound calls.

import type { WorkStore } from '../work/db-store';
import { mutateRegistry } from '../work/db-registry';
import { WorkConflictError } from '../work/db-store';
import type { WorkItem } from '../work/types';
import { VIRAT } from '../work/actors';
import { checkAdminAuth } from '../admin-auth';
import { brandCeoFor } from './types';
import { classifyFounderInput } from './founder-input';
import { processFounderInput, type OrchestratorOutcome, type RoutingDecision } from './orchestrator';
import type { RoleBindings } from './roles';
import { buildExtendedContext, answerAttention, type ExtendedCeoContext } from './ceo-context-extended';
import { brainContextSummary, type BrainContext } from './brain-context';

export const MAX_FOUNDER_TEXT = 2000;
const MAX_RELATED = 5;
const MAX_AUDIT_EVENTS = 5;

export interface WorkRef {
  id: string; ref: string; title: string; state: string; priority: string | null; owner: string | null;
  approval: { authority: string; requestedFrom: string; decided: string | null } | null;
}

export interface FounderResponse {
  understood: { inputId: string; kind: string; urgency: string; brand: string | null };
  context: { relatedWork: WorkRef[]; pendingApprovals: number; brandSummary: { openCount: number; criticalCount: number; blockedCount: number } | null };
  authority: { capability: string; level: string; allowed: boolean; holder: string | null; reason: string | null };
  outcome: { kind: string; operation: string; summary: string; mutationApplied: boolean; reusedExistingWork: boolean };
  work: WorkRef | null;
  routing: RoutingDecision | null;
  priority: { value: string; basis: string; reason: string; advisory: string | null } | null;
  similarWork: string[];
  /** Present only when the registry was written. Reads and clarifications carry none. */
  write: { operation: string; actor: string; source: string; authority: string; work: { ref: string; state: string } | null; auditEvents: string[] } | null;
  question: { id: string; routing: string; routedTo: string | null; text: string } | null;
  escalation: { required: boolean; to: string | null };
  nextStep: string;
  audit: string[];
  extended?: {
    agentCount: number;
    humanCount: number;
    brandCount: number;
    brainSummary: string | null;
    attentionSummary: string | null;
  };
}

export interface FounderRequestBody { text?: unknown; brand?: unknown; work_id?: unknown }

export type FounderResult =
  | { status: 200; body: FounderResponse }
  | { status: 400 | 401 | 409 | 503; body: { error: string } };

const workRef = (i: WorkItem): WorkRef => ({
  id: i.id, ref: i.ref, title: i.title, state: i.state, priority: i.priority, owner: i.owner?.id ?? null,
  approval: i.approval ? { authority: i.approval.authority, requestedFrom: i.approval.requested_from, decided: i.approval.decision?.outcome ?? null } : null,
});

export function toFounderResponse(o: OrchestratorOutcome): FounderResponse {
  const ctx = o.context;
  const auditEvents = o.workItem
    ? o.workItem.events.slice(-MAX_AUDIT_EVENTS).map((e) => `${e.at} ${e.kind} by ${e.actor.id}`)
    : [];
  return {
    understood: { inputId: o.input.id, kind: o.input.kind, urgency: o.input.urgency, brand: o.input.brand },
    context: {
      relatedWork: (ctx?.relatedWork ?? []).slice(0, MAX_RELATED).map(workRef),
      pendingApprovals: ctx?.pendingApprovals.length ?? 0,
      brandSummary: ctx?.brandSummary
        ? { openCount: ctx.brandSummary.openCount, criticalCount: ctx.brandSummary.criticalCount, blockedCount: ctx.brandSummary.blockedCount }
        : null,
    },
    authority: {
      capability: o.authority.capability,
      level: o.authority.level,
      allowed: o.authority.allowed,
      holder: o.authority.allowed ? null : o.authority.holder,
      reason: o.authority.allowed ? null : o.authority.reason,
    },
    outcome: { kind: o.kind, operation: o.operation, summary: o.summary, mutationApplied: o.mutationApplied, reusedExistingWork: o.reusedExistingWork },
    work: o.workItem ? workRef(o.workItem) : null,
    routing: o.routing,
    priority: o.priority ? { value: o.priority.priority, basis: o.priority.basis, reason: o.priority.reason, advisory: o.priority.advisory?.why ?? null } : null,
    similarWork: o.similarWork,
    write: o.mutationApplied
      ? {
          operation: o.operation,
          actor: o.operation === 'record_approval' ? o.input.from.id : 'DS-02',
          source: o.input.channel,
          authority: `${o.authority.capability} ${o.authority.level}${o.authority.allowed ? '' : ' (decided by ' + o.input.from.id + ')'}`,
          work: o.workItem ? { ref: o.workItem.ref, state: o.workItem.state } : null,
          auditEvents: o.workItem ? o.workItem.events.slice(-MAX_AUDIT_EVENTS).map((e) => e.kind) : [],
        }
      : null,
    question: o.question
      ? { id: o.question.id, routing: o.question.routing, routedTo: o.question.routed_to?.id ?? null, text: o.question.question }
      : null,
    escalation: { required: o.escalationRequired, to: o.authority.allowed ? null : o.authority.holder },
    nextStep: o.nextStep,
    audit: [...o.trace, ...auditEvents],
  };
}

export interface FounderDeps {
  store: WorkStore | null;
  adminPassword: string | undefined;
  now?: Date;
  bindings?: RoleBindings;
  brainContext?: import('./brain-context').BrainContext;
  decisions?: import('./db-stores').OrgDecision[];
  onboarding?: import('./db-stores').OnboardingRecord[];
  dashboards?: import('./db-stores').DashboardConfig[];
  storedAssessments?: Map<string, import('./agent-training').AssessmentResult[]>;
}

/** Whole request handler, kept out of the Astro route so it can be tested without the framework. */
export async function handleFounderInput(
  authorization: string | null,
  body: FounderRequestBody | null,
  deps: FounderDeps,
): Promise<FounderResult> {
  const auth = checkAdminAuth(authorization, deps.adminPassword);
  if (!auth.ok) return { status: auth.status, body: { error: auth.status === 503 ? 'Admin access is not configured' : 'Authentication required' } };
  if (!deps.store) return { status: 503, body: { error: 'Work Registry not configured' } };
  if (!body || typeof body.text !== 'string' || !body.text.trim()) return { status: 400, body: { error: 'Write the request first' } };
  if (body.text.length > MAX_FOUNDER_TEXT) return { status: 400, body: { error: `Keep it under ${MAX_FOUNDER_TEXT} characters` } };

  let brand: string | null = null;
  if (body.brand != null && body.brand !== '') {
    if (typeof body.brand !== 'string' || !brandCeoFor(body.brand)) return { status: 400, body: { error: 'Unknown brand' } };
    brand = body.brand;
  }
  const workId = typeof body.work_id === 'string' && body.work_id.trim() ? body.work_id.trim() : null;

  const now = deps.now ?? new Date();
  const store = deps.store;
  try {
    const result = await mutateRegistry(store, (registry): { value: FounderResult; changed: boolean } => {
      if (workId && !registry.get(workId)) return { value: { status: 400, body: { error: 'Unknown Work reference' } }, changed: false };
      const input = classifyFounderInput(body.text as string, VIRAT, { channel: 'command_centre', brand, work_id: workId, now });
      const outcome = processFounderInput(input, registry, { now, bindings: deps.bindings });
      const response = toFounderResponse(outcome);

      // Build extended context when deps are provided
      if (deps.decisions || deps.onboarding || deps.dashboards || deps.storedAssessments || deps.brainContext) {
        const extended = buildExtendedContext(input, registry, {
          now, decisions: deps.decisions, onboarding: deps.onboarding,
          dashboards: deps.dashboards, storedAssessments: deps.storedAssessments,
        });
        response.extended = {
          agentCount: extended.agents.length,
          humanCount: extended.humans.length,
          brandCount: extended.brands.length,
          brainSummary: deps.brainContext ? brainContextSummary(deps.brainContext) : null,
          attentionSummary: answerAttention(extended),
        };
      }

      return { value: { status: 200, body: response }, changed: outcome.mutationApplied };
    });
    return result;
  } catch (e) {
    if (e instanceof WorkConflictError) return { status: 409, body: { error: 'Another change to this Work landed first. Nothing was written; send it again.' } };
    throw e;
  }
}
