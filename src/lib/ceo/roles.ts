// Role → current holder. Generic CEO logic routes by role/capability and asks this table who holds the role.
// A change of holder is an edit to ROLE_BINDINGS, never to authority or orchestration code.
// Pure configuration and deterministic lookups. No AI invocations.

import type { Actor, Authority } from '../work/types';
import { PRINCE, sameActor } from '../work/actors';

export const TECHNICAL_DEPLOYMENT_OFFICER = 'technical_deployment_officer' as const;
export type RoleId = typeof TECHNICAL_DEPLOYMENT_OFFICER;
export type WorkFunction = 'technical_deployment';

export interface RoleHolder { actor: Actor; name: string }

export interface RoleDefinition {
  id: RoleId;
  label: string;
  function: WorkFunction;
  /** Agent that governs the function. The CTO agent is not in AGENT_REGISTRY, so Dev (DS-02) governs until it is. */
  governance: string;
  /** Authority that must approve before work is assigned to a holder of this role. */
  assignmentAuthority: Authority;
  holders: readonly RoleHolder[];
}

export type RoleBindings = Readonly<Record<RoleId, RoleDefinition>>;

export const ROLE_BINDINGS: RoleBindings = {
  technical_deployment_officer: {
    id: 'technical_deployment_officer',
    label: 'Technical Deployment Officer',
    function: 'technical_deployment',
    governance: 'DS-02',
    assignmentAuthority: 'prince_assignment',
    holders: [{ actor: PRINCE, name: 'Prince Keshri' }],
  },
};

export function roleForFunction(fn: WorkFunction, bindings: RoleBindings = ROLE_BINDINGS): RoleDefinition {
  const role = Object.values(bindings).find((r) => r.function === fn);
  if (!role) throw new Error(`no role is bound to function "${fn}"`);
  return role;
}

export function holdersOf(role: RoleId, bindings: RoleBindings = ROLE_BINDINGS): readonly RoleHolder[] {
  return bindings[role]?.holders ?? [];
}

export function rolesHeldBy(actor: Actor, bindings: RoleBindings = ROLE_BINDINGS): RoleId[] {
  return (Object.keys(bindings) as RoleId[]).filter((id) => bindings[id].holders.some((h) => sameActor(h.actor, actor)));
}

// Scope: accounts, integrations, keys, webhooks, templates, DNS, deploys, setup records (CLAUDE.md, Team section).
const TECHNICAL_DEPLOYMENT = /\b(deploy(?:ment|ing)?|dns|webhooks?|integrations?|api\s+keys?|domain|ssl|hosting|vercel|smtp|set\s*up\s+(?:the\s+)?(?:account|integration|webhook)|connect\s+(?:the\s+)?(?:shopify|shiprocket|razorpay|whatsapp))\b/i;

/** Deterministic: which function does this work belong to, if it is one that has a bound human role. */
export function functionForText(text: string): WorkFunction | null {
  return TECHNICAL_DEPLOYMENT.test(text) ? 'technical_deployment' : null;
}
