// Authority check: maps an action to the autonomy model and determines
// whether the CEO can act, or needs escalation/approval.
// Pure deterministic logic. No AI invocations.

import type { Actor, Authority } from '../work/types';
import { AUTHORITY_HOLDERS, isPrince, isVirat } from '../work/actors';
import {
  CEO_ID, CEO, autonomyFor, canActAutonomously,
  type AutonomyLevel, type AutonomyGrant,
} from './types';
import type { FounderInput, FounderInputKind } from './founder-input';

export type AuthorityVerdict =
  | { allowed: true; level: AutonomyLevel; capability: string }
  | { allowed: false; level: AutonomyLevel; capability: string; holder: string; reason: string };

export function checkAuthority(capability: string): AuthorityVerdict {
  const grant = autonomyFor(capability);
  if (!grant) {
    return { allowed: false, level: 'L4', capability, holder: 'DS-00', reason: `No grant for "${capability}"` };
  }
  if (canActAutonomously(capability)) {
    return { allowed: true, level: grant.level, capability };
  }
  return {
    allowed: false,
    level: grant.level,
    capability,
    holder: grant.holder,
    reason: grant.level === 'L4'
      ? `Human decision required (${grant.holder})`
      : grant.level === 'L1'
        ? `Recommend only — approval needed (${grant.holder})`
        : `Observe only (${grant.holder})`,
  };
}

export function requiredCapabilityForInput(input: FounderInput): string {
  switch (input.kind) {
    case 'work_request': return 'create-work';
    case 'instruction': return requiresInvestigation(input.text) ? 'monitor-work' : 'create-work';
    case 'approval': return resolveApprovalCapability(input.text);
    case 'decision': return 'report-to-founder';
    case 'question': return 'monitor-work';
    case 'evidence': return 'monitor-work';
    case 'context': return 'monitor-work';
    case 'relationship': return 'report-to-founder';
  }
}

function requiresInvestigation(text: string): boolean {
  return /\b(check|investigate|look\s+into|find\s+out|debug|diagnose)\b/i.test(text);
}

function resolveApprovalCapability(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(spend|budget|money|cost|pay|₹|\$)\b/.test(lower)) return 'approve-spend';
  if (/\b(price|pricing|offer|discount)\b/.test(lower)) return 'approve-pricing';
  if (/\b(send|email|whatsapp|message|post|publish)\b/.test(lower)) return 'approve-outbound-comms';
  if (/\b(prince|p-01)\b/i.test(lower)) return 'approve-prince-work';
  if (/\b(terms|nda|legal|contract|agreement)\b/.test(lower)) return 'approve-terms-legal';
  return 'approve-irreversible';
}

export function canCeoAssign(target: Actor): AuthorityVerdict {
  if (isPrince(target)) {
    return {
      allowed: false, level: 'L4', capability: 'assign-work',
      holder: 'DS-00', reason: 'Prince gets work only through Virat',
    };
  }
  return checkAuthority('assign-work');
}

export function resolveApprovalAuthority(authority: Authority): { holders: readonly string[]; capability: string } {
  const holders = AUTHORITY_HOLDERS[authority];
  const capabilityMap: Partial<Record<Authority, string>> = {
    money: 'approve-spend',
    pricing: 'approve-pricing',
    outbound_comms: 'approve-outbound-comms',
    social_post: 'approve-outbound-comms',
    prince_assignment: 'approve-prince-work',
    terms_legal: 'approve-terms-legal',
    irreversible: 'approve-irreversible',
    strategic: 'approve-irreversible',
    expansion: 'approve-irreversible',
  };
  return {
    holders: holders.map(h => h),
    capability: capabilityMap[authority] ?? 'approve-irreversible',
  };
}
