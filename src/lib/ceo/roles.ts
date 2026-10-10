// Role → current holder. Generic CEO logic routes by role/capability and asks this table who holds the role.
// A change of holder is an edit to ROLE_BINDINGS, never to authority or orchestration code.
// Pure configuration and deterministic lookups. No AI invocations.

import type { Actor, Authority } from '../work/types';
import { PRINCE, sameActor } from '../work/actors';
import { deploymentIntent, isDeploymentQuestion } from './deployment-intent';

export const TECHNICAL_DEPLOYMENT_OFFICER = 'technical_deployment_officer' as const;
export const GROWTH_SPECIALIST = 'growth_specialist' as const;
export const QUALITY_SPECIALIST = 'quality_specialist' as const;
export const SALES_SPECIALIST = 'sales_specialist' as const;
export const FINANCE_SPECIALIST = 'finance_specialist' as const;
export const CUSTOMER_CARE_SPECIALIST = 'customer_care_specialist' as const;
export const TEAM_OPS_SPECIALIST = 'team_ops_specialist' as const;

export type RoleId =
  | typeof TECHNICAL_DEPLOYMENT_OFFICER
  | typeof GROWTH_SPECIALIST
  | typeof QUALITY_SPECIALIST
  | typeof SALES_SPECIALIST
  | typeof FINANCE_SPECIALIST
  | typeof CUSTOMER_CARE_SPECIALIST
  | typeof TEAM_OPS_SPECIALIST;

export type WorkFunction =
  | 'technical_deployment'
  | 'growth'
  | 'quality'
  | 'sales'
  | 'finance'
  | 'customer_care'
  | 'team_ops';

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

const GROW: Actor = { kind: 'agent', id: 'DS-11' };
const CHECK: Actor = { kind: 'agent', id: 'DS-10' };
const DEAL: Actor = { kind: 'agent', id: 'DS-12' };
const BOOKS: Actor = { kind: 'agent', id: 'DS-13' };
const CARE: Actor = { kind: 'agent', id: 'DS-14' };
const CREW: Actor = { kind: 'agent', id: 'DS-15' };

export const ROLE_BINDINGS: RoleBindings = {
  technical_deployment_officer: {
    id: 'technical_deployment_officer',
    label: 'Technical Deployment Officer',
    function: 'technical_deployment',
    governance: 'DS-02',
    assignmentAuthority: 'prince_assignment',
    holders: [{ actor: PRINCE, name: 'Prince Keshri' }],
  },
  growth_specialist: {
    id: 'growth_specialist',
    label: 'Head of Growth',
    function: 'growth',
    governance: 'DS-02',
    assignmentAuthority: 'technical_deployment',
    holders: [{ actor: GROW, name: 'Grow (DS-11)' }],
  },
  quality_specialist: {
    id: 'quality_specialist',
    label: 'Head of Quality',
    function: 'quality',
    governance: 'DS-02',
    assignmentAuthority: 'technical_deployment',
    holders: [{ actor: CHECK, name: 'Check (DS-10)' }],
  },
  sales_specialist: {
    id: 'sales_specialist',
    label: 'Head of Sales',
    function: 'sales',
    governance: 'DS-02',
    assignmentAuthority: 'technical_deployment',
    holders: [{ actor: DEAL, name: 'Deal (DS-12)' }],
  },
  finance_specialist: {
    id: 'finance_specialist',
    label: 'Head of Finance',
    function: 'finance',
    governance: 'DS-02',
    assignmentAuthority: 'technical_deployment',
    holders: [{ actor: BOOKS, name: 'Books (DS-13)' }],
  },
  customer_care_specialist: {
    id: 'customer_care_specialist',
    label: 'Head of Customer Care',
    function: 'customer_care',
    governance: 'DS-02',
    assignmentAuthority: 'technical_deployment',
    holders: [{ actor: CARE, name: 'Care (DS-14)' }],
  },
  team_ops_specialist: {
    id: 'team_ops_specialist',
    label: 'Head of Team & Ops',
    function: 'team_ops',
    governance: 'DS-02',
    assignmentAuthority: 'prince_assignment',
    holders: [{ actor: CREW, name: 'Crew (DS-15)' }],
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

/** Deterministic: which function does this belong to. Deployment is checked first (human role),
 *  then specialist functions (agent roles). */
export function functionForText(text: string, kind: 'action' | 'question' = 'action'): WorkFunction | null {
  if (kind === 'question' && isDeploymentQuestion(text)) return 'technical_deployment';
  if (deploymentIntent(text)) return 'technical_deployment';
  return matchSpecialistFunction(text);
}

// Explicit specialist references: "[to Grow]", "ask Check", "Grow: ...", agent IDs
const AGENT_REF = /\b(?:\[?\s*(?:to\s+)?)(grow|check|deal|books|care|crew|guard|improve)\b(?:\s*[\]:,]|\s+(?:should|must|needs?|run|do|handle|audit|review|generate|send|post))/i;
const AGENT_ID_REF = /\b(DS-1[0-7])\b/;

const SPECIALIST_ID_MAP: Record<string, WorkFunction> = {
  grow: 'growth', 'ds-11': 'growth',
  check: 'quality', 'ds-10': 'quality',
  deal: 'sales', 'ds-12': 'sales',
  books: 'finance', 'ds-13': 'finance',
  care: 'customer_care', 'ds-14': 'customer_care',
  crew: 'team_ops', 'ds-15': 'team_ops',
};

function matchSpecialistFunction(text: string): WorkFunction | null {
  const nameMatch = AGENT_REF.exec(text);
  if (nameMatch) {
    const fn = SPECIALIST_ID_MAP[nameMatch[1].toLowerCase()];
    if (fn) return fn;
  }
  const idMatch = AGENT_ID_REF.exec(text);
  if (idMatch) {
    const fn = SPECIALIST_ID_MAP[idMatch[1].toLowerCase()];
    if (fn) return fn;
  }
  return null;
}
