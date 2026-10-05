// Authority check: maps an action to the autonomy model and determines
// whether the CEO can act, or needs escalation/approval.
// Routing is by role/function/capability, not by hardcoded person name.
// Pure deterministic logic. No AI invocations.

import type { Actor, Authority } from '../work/types';
import { AUTHORITY_HOLDERS } from '../work/actors';
import { ROLE_BINDINGS, rolesHeldBy, type RoleBindings, type RoleId } from './roles';
import {
  CEO_ID, CEO, AGENT_REGISTRY, autonomyFor, canActAutonomously, brandCeoFor,
  type AutonomyLevel, type AutonomyGrant, type AgentEntry,
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
  if (/\b(terms|nda|legal|contract|agreement)\b/.test(lower)) return 'approve-terms-legal';
  return 'approve-irreversible';
}

/**
 * Can the CEO assign work to this actor? The assign-work grant lists `restrictedRoles`. If the target holds
 * one of those roles (resolved from the role bindings), the assignment needs the role's assignment authority.
 * Nothing here names a person: who holds a role is configuration in roles.ts.
 */
export function canCeoAssign(target: Actor, bindings: RoleBindings = ROLE_BINDINGS): AuthorityVerdict {
  const grant = autonomyFor('assign-work');
  if (!grant) {
    return { allowed: false, level: 'L4', capability: 'assign-work', holder: 'DS-00', reason: 'No assign-work grant' };
  }
  const restricted = (grant.limits?.restrictedRoles as RoleId[] | undefined) ?? [];
  const held = rolesHeldBy(target, bindings).find((r) => restricted.includes(r));
  if (held) {
    const authority = bindings[held].assignmentAuthority;
    return {
      allowed: false, level: 'L4', capability: 'assign-work',
      holder: resolveApproverForAuthority(authority),
      reason: `Assignment to ${held} requires approval (authority: ${authority})`,
    };
  }
  return checkAuthority('assign-work');
}

function resolveApproverForAuthority(authority: Authority): string {
  const holders = AUTHORITY_HOLDERS[authority];
  if (!holders || holders.length === 0) return 'DS-00';
  return holders.includes('virat') ? 'DS-00' : 'DS-00';
}

export function resolveApprovalAuthority(authority: Authority): { holders: readonly string[]; capability: string } {
  const holders = AUTHORITY_HOLDERS[authority];
  const capabilityMap: Partial<Record<Authority, string>> = {
    money: 'approve-spend',
    pricing: 'approve-pricing',
    outbound_comms: 'approve-outbound-comms',
    social_post: 'approve-outbound-comms',
    prince_assignment: 'approve-restricted-assignment',
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

/**
 * Resolve the appropriate function/role owner for a given work type and scope.
 * Routes by capability, not by person name.
 */
export function resolveOwnerByFunction(workType: string, brand: string | null): { role: string; agentId: string | null } {
  if (brand) {
    const brandCeo = brandCeoFor(brand);
    if (brandCeo) return { role: 'brand_ceo', agentId: brandCeo.id };
  }
  switch (workType) {
    case 'technical': return { role: 'ceo', agentId: CEO_ID };
    case 'growth': return { role: 'hod', agentId: 'DS-11' };
    case 'finance': return { role: 'hod', agentId: 'DS-13' };
    case 'quality': return { role: 'hod', agentId: 'DS-10' };
    case 'sales': return { role: 'hod', agentId: 'DS-12' };
    case 'customer': return { role: 'hod', agentId: 'DS-14' };
    case 'team': return { role: 'hod', agentId: 'DS-15' };
    default: return { role: 'ceo', agentId: CEO_ID };
  }
}
