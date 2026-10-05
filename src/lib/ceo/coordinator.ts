// DevShop CEO coordinator: the operating logic layer.
// Interprets requests, locates/creates Work, determines owners, detects exceptions.
// Pure deterministic logic. No AI invocations in this module.

import type { InMemoryWorkRegistry, NewWorkInput } from '../work/registry';
import type { Actor, Priority, Scope, WorkItem, WorkType } from '../work/types';
import { suggestPriority, NO_FACTORS } from '../work/priority';
import { Scopes } from '../work/scope';
import { AUTHORITY_HOLDERS } from '../work/actors';
import { buildControlTowerView } from '../control-tower/view';
import { CEO, CEO_ID, brandCeoFor, findAgent, canActAutonomously, type AutonomyLevel, type AuditCategory } from './types';
import type { WorkQuestion, QuestionRouting } from './types';

// ── Request interpretation ────────────────────────────────────────────────

export interface CeoRequest {
  text: string;
  from: Actor;
  brand?: string | null;
  channel?: string;
}

export interface CeoAction {
  action: 'create_work' | 'find_work' | 'status_query' | 'approval_response' | 'investigation' | 'delegate';
  work_id?: string;
  title?: string;
  scope?: Scope;
  assigned_to?: string;
  priority?: Priority;
  reason: string;
}

export function classifyRequest(req: CeoRequest): CeoAction {
  const lower = req.text.toLowerCase();

  if (lower.includes('what needs my attention') || lower.includes('morning') || lower.includes('status')) {
    return { action: 'status_query', reason: 'Founder status request' };
  }

  if (lower.includes('approve') || lower.includes('approved') || lower.includes('yes go ahead')) {
    return { action: 'approval_response', reason: 'Approval decision' };
  }

  if (lower.includes('check why') || lower.includes('investigate') || lower.includes('look into')) {
    return {
      action: 'investigation',
      scope: req.brand ? Scopes.brand(req.brand) : undefined,
      reason: 'Investigation request',
    };
  }

  if (lower.includes('handle') || lower.includes('fix') || lower.includes('resolve')) {
    return {
      action: 'create_work',
      scope: req.brand ? Scopes.brand(req.brand) : Scopes.devshop(),
      title: req.text,
      reason: 'Work request from founder',
    };
  }

  return {
    action: 'delegate',
    reason: 'Instruction to be interpreted and routed',
  };
}

// ── Owner determination ───────────────────────────────────────────────────

export function suggestOwner(scope: Scope, type: WorkType): Actor {
  if (scope.kind === 'brand' && scope.brand) {
    const brandCeo = brandCeoFor(scope.brand);
    if (brandCeo) return { kind: 'agent', id: brandCeo.id };
  }
  return CEO;
}

// ── Duplicate detection ───────────────────────────────────────────────────

export function findExistingWork(
  registry: InMemoryWorkRegistry,
  title: string,
  scope: Scope,
): WorkItem | null {
  const open = registry.list().filter((i) => i.state !== 'closed' && i.merged_into === null);
  const titleLower = title.toLowerCase();
  const tokens = new Set(titleLower.split(/\s+/).filter((t) => t.length > 3));

  for (const item of open) {
    if (item.scope.brand === scope.brand) {
      const itemTokens = new Set(item.title.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
      const overlap = [...tokens].filter((t) => itemTokens.has(t)).length;
      if (overlap >= 2 || item.title.toLowerCase() === titleLower) {
        return item;
      }
    }
  }
  return null;
}

// ── Audit loop ────────────────────────────────────────────────────────────

export interface AuditFinding {
  category: AuditCategory;
  items: WorkItem[];
  severity: 'info' | 'warning' | 'critical';
  recommendation: string;
}

export function runAuditLoop(registry: InMemoryWorkRegistry, now: Date = new Date()): AuditFinding[] {
  const open = registry.list().filter((i) => i.state !== 'closed');
  const findings: AuditFinding[] = [];

  // Unassigned work past 'new'
  const unassigned = open.filter((i) => !i.owner && i.state !== 'new');
  if (unassigned.length > 0) {
    findings.push({
      category: 'unassigned_work',
      items: unassigned,
      severity: unassigned.some((i) => i.priority === 'P0' || i.priority === 'P1') ? 'critical' : 'warning',
      recommendation: 'Assign owners to triaged work',
    });
  }

  // Blocked work older than 24 hours
  const blocked = open.filter((i) => {
    if (i.state !== 'blocked' || !i.blocked) return false;
    return (now.getTime() - new Date(i.blocked.since).getTime()) > 86_400_000;
  });
  if (blocked.length > 0) {
    findings.push({
      category: 'blocked_work',
      items: blocked,
      severity: blocked.some((i) => i.priority === 'P0') ? 'critical' : 'warning',
      recommendation: 'Unblock or escalate stale blocked work',
    });
  }

  // Overdue work
  const overdue = open.filter((i) => i.deadline && new Date(i.deadline.at) < now);
  if (overdue.length > 0) {
    findings.push({
      category: 'overdue_work',
      items: overdue,
      severity: overdue.some((i) => i.deadline?.kind === 'promise') ? 'critical' : 'warning',
      recommendation: 'Address overdue items, especially promises',
    });
  }

  // Unresolved approvals older than 24h
  const staleApprovals = open.filter((i) => {
    if (i.state !== 'pending_approval' || !i.approval) return false;
    return (now.getTime() - new Date(i.approval.requested_at).getTime()) > 86_400_000;
  });
  if (staleApprovals.length > 0) {
    findings.push({
      category: 'unresolved_approvals',
      items: staleApprovals,
      severity: 'warning',
      recommendation: 'Chase pending approvals',
    });
  }

  // Recurring incidents (same brand, same type, multiple items)
  const incidentsByBrand = new Map<string, WorkItem[]>();
  for (const item of open) {
    if (item.type === 'incident' && item.scope.brand) {
      const key = item.scope.brand;
      const list = incidentsByBrand.get(key) ?? [];
      list.push(item);
      incidentsByBrand.set(key, list);
    }
  }
  for (const [brand, incidents] of incidentsByBrand) {
    if (incidents.length >= 2) {
      findings.push({
        category: 'recurring_incidents',
        items: incidents,
        severity: 'warning',
        recommendation: `Brand "${brand}" has ${incidents.length} open incidents — investigate root cause`,
      });
    }
  }

  // Security risks
  const securityRisks = open.filter((i) => i.security_risk && (i.security_risk.level === 'high' || i.security_risk.level === 'critical'));
  if (securityRisks.length > 0) {
    findings.push({
      category: 'security_risk',
      items: securityRisks,
      severity: 'critical',
      recommendation: 'Address security risks immediately',
    });
  }

  return findings.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });
}

// ── Question routing ──────────────────────────────────────────────────────

export function createQuestion(
  workId: string,
  askedBy: Actor,
  question: string,
  routing: QuestionRouting,
  now: Date = new Date(),
): WorkQuestion {
  const routedTo = routeQuestionToActor(routing);
  return {
    id: `q-${now.getTime()}`,
    work_id: workId,
    asked_by: askedBy,
    asked_at: now.toISOString(),
    question,
    routing,
    routed_to: routedTo,
    status: 'open',
    answer: null,
    answered_by: null,
    answered_at: null,
  };
}

function routeQuestionToActor(routing: QuestionRouting): Actor {
  switch (routing) {
    case 'technical': return CEO;
    case 'brand': return CEO;
    case 'financial': return { kind: 'agent', id: 'DS-13' };
    case 'strategic': return { kind: 'human', id: 'DS-00' };
    case 'ops': return { kind: 'human', id: 'DS-00' };
    case 'legal': return { kind: 'human', id: 'DS-00' };
  }
}

export function answerQuestion(q: WorkQuestion, answer: string, by: Actor, now: Date = new Date()): WorkQuestion {
  return { ...q, status: 'answered', answer, answered_by: by, answered_at: now.toISOString() };
}
