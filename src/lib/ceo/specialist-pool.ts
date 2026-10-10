// Shared functional specialist pool.
// HODs own competence and standards. Brand CEOs own results. CEO orchestrates.
// A specialist receives work scoped to one brand, executes within that scope, persists results independently.
// No specialist is duplicated per brand. Pure and deterministic; no AI invocations.

import type { Actor, Scope } from '../work/types';
import { AGENT_REGISTRY, findAgent, brandCeoFor, type AgentEntry } from './types';

// ── Functional domains ───────────────────────────────────────────────────

export const SPECIALIST_FUNCTIONS = [
  'quality', 'growth', 'sales', 'finance', 'customer_care', 'team_ops',
  'visual_design', 'process_efficiency',
] as const;
export type SpecialistFunction = (typeof SPECIALIST_FUNCTIONS)[number];

export interface FunctionalDomain {
  function: SpecialistFunction;
  hodId: string;
  label: string;
  capabilities: string[];
}

export const FUNCTIONAL_DOMAINS: FunctionalDomain[] = [
  { function: 'quality', hodId: 'DS-10', label: 'Quality', capabilities: ['quality', 'health-checks', 'audits'] },
  { function: 'growth', hodId: 'DS-11', label: 'Growth & Content', capabilities: ['growth', 'content', 'launches', 'social'] },
  { function: 'sales', hodId: 'DS-12', label: 'Sales', capabilities: ['sales', 'leads', 'NDAs', 'proposals'] },
  { function: 'finance', hodId: 'DS-13', label: 'Finance', capabilities: ['finance', 'invoices', 'statements', 'P&L'] },
  { function: 'customer_care', hodId: 'DS-14', label: 'Customer Care', capabilities: ['customer-care', 'whatsapp-inbox', 'FAQ'] },
  { function: 'team_ops', hodId: 'DS-15', label: 'Team & Ops', capabilities: ['team', 'ops-checklist'] },
  { function: 'visual_design', hodId: 'DS-16', label: 'Visual Design & Brand Guardian', capabilities: ['visual-qa', 'brand-guardian', 'design-review', 'platform-compliance'] },
  { function: 'process_efficiency', hodId: 'DS-17', label: 'Process Efficiency', capabilities: ['improvement-detection', 'root-cause-analysis', 'prevention'] },
];

export function domainForFunction(fn: SpecialistFunction): FunctionalDomain {
  const d = FUNCTIONAL_DOMAINS.find(d => d.function === fn);
  if (!d) throw new Error(`unknown specialist function "${fn}"`);
  return d;
}

export function domainForAgent(agentId: string): FunctionalDomain | undefined {
  return FUNCTIONAL_DOMAINS.find(d => d.hodId === agentId);
}

// ── Capability matching ──────────────────────────────────────────────────

const CAPABILITY_KEYWORDS: Record<SpecialistFunction, RegExp> = {
  quality: /\b(quality|health.?check|audit|link.?check|broken.?link|test|qa)\b/i,
  growth: /\b(grow|growth|content|launch|social|marketing|reel|post|campaign|seo|utm|acquisition|traffic)\b/i,
  sales: /\b(sale|lead|nda|proposal|deal|pipeline|prospect|outreach)\b/i,
  finance: /\b(financ|invoice|p.?&.?l|ebitda|statement|payment|revenue|margin|cost|budget|unit.?economics)\b/i,
  customer_care: /\b(customer|care|support|whatsapp.?inbox|faq|complaint|return|refund|rto)\b/i,
  team_ops: /\b(team|ops|prince|checklist|onboard|hr|crew)\b/i,
  visual_design: /\b(visual|design|brand.?guardian|brand.?book|compliance|image|creative|ui|ux)\b/i,
  process_efficiency: /\b(improve|improvement|process|root.?cause|recurrence|standardis|prevention|ptm)\b/i,
};

export function matchFunction(text: string): SpecialistFunction | null {
  let best: { fn: SpecialistFunction; idx: number } | null = null;
  for (const fn of SPECIALIST_FUNCTIONS) {
    const m = CAPABILITY_KEYWORDS[fn].exec(text);
    if (m && (best === null || m.index < best.idx)) {
      best = { fn, idx: m.index };
    }
  }
  return best?.fn ?? null;
}

// ── Scoped execution ─────────────────────────────────────────────────────

export interface ScopedAssignment {
  specialistId: string;
  specialistName: string;
  function: SpecialistFunction;
  brandScope: Scope;
  brandCeoId: string | null;
  hodId: string;
  governedBy: string;
}

export function assignSpecialist(
  fn: SpecialistFunction,
  brandKey: string | null,
  scope: Scope,
): ScopedAssignment {
  const domain = domainForFunction(fn);
  const agent = findAgent(domain.hodId);
  if (!agent) throw new Error(`agent ${domain.hodId} not in registry`);
  const brandCeo = brandKey ? brandCeoFor(brandKey) : undefined;
  return {
    specialistId: domain.hodId,
    specialistName: agent.name,
    function: fn,
    brandScope: scope,
    brandCeoId: brandCeo?.id ?? null,
    hodId: domain.hodId,
    governedBy: agent.reports_to || 'DS-02',
  };
}

// ── Cross-brand isolation check ──────────────────────────────────────────

export function validateBrandIsolation(
  assignment: ScopedAssignment,
  existingAssignments: ScopedAssignment[],
): { isolated: true } | { isolated: false; conflict: string } {
  // A specialist can work on multiple brands — that's the point.
  // But each execution must be scoped to exactly one brand. No cross-brand data leakage.
  if (assignment.brandScope.kind === 'brand' && !assignment.brandScope.brand) {
    return { isolated: false, conflict: 'brand-scoped work must specify a brand key' };
  }
  return { isolated: true };
}

// ── Specialist availability ──────────────────────────────────────────────

export function availableSpecialists(): FunctionalDomain[] {
  return FUNCTIONAL_DOMAINS.filter(d => findAgent(d.hodId) !== undefined);
}

export function specialistForBrand(fn: SpecialistFunction, brandKey: string): ScopedAssignment | null {
  const domain = domainForFunction(fn);
  const agent = findAgent(domain.hodId);
  if (!agent) return null;
  const scope: Scope = { kind: 'brand', brand: brandKey, founder: null, system: null, extension: null };
  return assignSpecialist(fn, brandKey, scope);
}
