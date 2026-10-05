// Approvals: the foundation the work lifecycle needs, not a generic approval engine.
// A request (who, what authority, why, evidence, recommendation) puts the item in PENDING APPROVAL.
// A decision is recorded by a person who actually holds that authority, with a timestamp, and is
// kept in the audit trail. Agents cannot approve.

import type { Actor, Approval, Authority, HumanCoverage, Result, Scope } from './types';
import { AUTHORITIES, HUMAN_COVERAGE } from './types';
import { fail, ok } from './types';
import { AUTHORITY_HOLDERS, actorCoversCoverage } from './actors';

export interface ApprovalRequestInput {
  requested_from: HumanCoverage;
  authority: Authority;
  reason: string;
  evidence_ids: string[];
  recommendation: string;
}

export function validateApprovalRequest(i: ApprovalRequestInput): Result<ApprovalRequestInput> {
  if (!HUMAN_COVERAGE.includes(i.requested_from)) return fail('approval_invalid', `unknown approver "${i.requested_from}"`);
  if (!AUTHORITIES.includes(i.authority)) return fail('approval_invalid', `unknown authority "${i.authority}"`);
  if (!AUTHORITY_HOLDERS[i.authority].includes(i.requested_from)) {
    return fail('approval_invalid', `${i.requested_from} does not hold "${i.authority}" authority; it belongs to ${AUTHORITY_HOLDERS[i.authority].join(' or ')}`);
  }
  if (!i.reason?.trim()) return fail('approval_invalid', 'a reason is required');
  if (!i.recommendation?.trim()) return fail('approval_invalid', 'a recommendation is required');
  if (!Array.isArray(i.evidence_ids) || i.evidence_ids.length === 0) return fail('approval_invalid', 'at least one piece of evidence is required');
  return ok(i);
}

export function validateDecision(approval: Approval, by: Actor, scope: Scope): Result<true> {
  if (approval.decision) return fail('approval_invalid', 'this approval already has a decision');
  if (by.kind === 'agent' || by.kind === 'system') return fail('approval_not_allowed', 'agents and systems cannot approve: a person decides');
  if (!actorCoversCoverage(by, approval.requested_from, scope)) {
    return fail('approval_not_allowed', `${by.id} cannot decide this: it was requested from ${approval.requested_from}`);
  }
  return ok(true);
}
