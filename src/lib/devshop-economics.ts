// Stage 5D — Custom Build delivery economics: the deterministic measurement layer. Pure functions
// only, no I/O, no LLM. This answers, per project, "what did it generate, what did it consume, how
// many human hours (and how many were Virat's), and what direct contribution did it produce?"
//
// It computes over explicit inputs; it never invents a number. Missing inputs surface as an
// UNKNOWN result, never a silent zero. It does NOT price anything, does NOT allocate overhead, and
// keeps project economics separate from DevShop P&L and from VM personal income.
//
// Persistence for the inputs (a work log, direct costs, revenue actuals) needs new tables — that
// migration is PROPOSED for approval, not applied. This module is the engine those tables feed.

import { IMPLEMENTATION_ROLES, type ImplementationRole } from './implementation';

// Delivery roles = the existing implementation vocabulary plus 'founder' (Virat), tracked separately
// so founder dependency is always measurable on its own.
export const DELIVERY_ROLES = [...IMPLEMENTATION_ROLES, 'founder'] as const;
export type DeliveryRole = (typeof DELIVERY_ROLES)[number];
export const isFounderRole = (r: DeliveryRole) => r === 'founder';

export const WORK_CATEGORIES = ['BUILD', 'QA', 'CLIENT', 'SCOPING', 'REVISION', 'GO_LIVE', 'SUPPORT', 'OTHER'] as const;
export type WorkCategory = (typeof WORK_CATEGORIES)[number];

export type WorkLogEntry = { date: string; role: DeliveryRole; hours: number; category: WorkCategory; note?: string | null };

// Cost attribution kept strict: only DIRECT costs belong to a project. SHARED/OVERHEAD are recorded
// but never folded into a single project's economics (that would corrupt future DevShop P&L).
export type CostAttribution = 'direct' | 'shared' | 'overhead';
export type DirectCost = { amountPaise: number; category: string; attribution: CostAttribution; source: string; actual: boolean };

// Revenue is not one number: contracted ≠ invoiced ≠ collected, and a deposit is none of them.
export type ProjectRevenue = { contractedPaise?: number | null; invoicedPaise?: number | null; collectedPaise?: number | null };
export type RevenueBasis = 'contracted' | 'invoiced' | 'collected';

export type Known<T> = { known: true; value: T } | { known: false; reason: string };
const known = <T,>(value: T): Known<T> => ({ known: true, value });
const unknown = <T,>(reason: string): Known<T> => ({ known: false, reason });

// ── Hours ────────────────────────────────────────────────────────────────────────────────────────
export function hoursByRole(log: WorkLogEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of log) out[e.role] = (out[e.role] ?? 0) + e.hours;
  return out;
}
export const totalHours = (log: WorkLogEntry[]) => log.reduce((s, e) => s + e.hours, 0);
export const founderHours = (log: WorkLogEntry[]) => log.filter((e) => isFounderRole(e.role)).reduce((s, e) => s + e.hours, 0);
export function hoursByCategory(log: WorkLogEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of log) out[e.category] = (out[e.category] ?? 0) + e.hours;
  return out;
}

// ── Costs ──────────────────────────────────────────────────────────────────────────────────────
/** Only DIRECT, actual costs count toward a project. Shared/overhead are excluded by design. */
export function directCostPaise(costs: DirectCost[]): number {
  return costs.filter((c) => c.attribution === 'direct').reduce((s, c) => s + c.amountPaise, 0);
}

/**
 * Direct human labour cost — only when an authoritative per-role rate (paise/hour) is supplied for
 * every role present in the log. No rate → UNKNOWN (never a guessed rate, never zero). Founder hours
 * are never monetised here (no authoritative founder rate exists).
 */
export function directLabourCostPaise(log: WorkLogEntry[], ratePaisePerHour?: Partial<Record<DeliveryRole, number>>): Known<number> {
  if (!ratePaisePerHour) return unknown('no per-role cost rates supplied');
  const billable = log.filter((e) => !isFounderRole(e.role));
  const rolesPresent = [...new Set(billable.map((e) => e.role))];
  const missing = rolesPresent.filter((r) => ratePaisePerHour[r] == null);
  if (missing.length) return unknown(`no cost rate for role(s): ${missing.join(', ')}`);
  return known(billable.reduce((s, e) => s + e.hours * (ratePaisePerHour[e.role] as number), 0));
}

// ── Revenue ──────────────────────────────────────────────────────────────────────────────────────
export function revenueOnBasis(rev: ProjectRevenue, basis: RevenueBasis): Known<number> {
  const v = basis === 'contracted' ? rev.contractedPaise : basis === 'invoiced' ? rev.invoicedPaise : rev.collectedPaise;
  return v == null ? unknown(`${basis} revenue not recorded`) : known(v);
}

// ── Contribution (management-accounting, NOT profit) ───────────────────────────────────────────────
export type Contribution = {
  revenueBasis: RevenueBasis;
  revenuePaise: number;
  directNonLabourPaise: number;
  directLabourPaise: number | null;   // null when labour cost is UNKNOWN
  includesLabour: boolean;
  contributionPaise: number;          // revenue − direct non-labour − (labour if known)
  totalHours: number;
  founderHours: number;
};

/**
 * Project contribution on a stated revenue basis. Returns UNKNOWN (not zero) if that revenue basis
 * is not recorded. Labour is included only when authoritative rates give a known labour cost;
 * otherwise contribution is "before labour" and includesLabour is false, with hours always exposed.
 */
export function projectContribution(
  rev: ProjectRevenue, costs: DirectCost[], log: WorkLogEntry[],
  opts: { basis?: RevenueBasis; ratePaisePerHour?: Partial<Record<DeliveryRole, number>> } = {},
): Known<Contribution> {
  const basis = opts.basis ?? 'collected';
  const r = revenueOnBasis(rev, basis);
  if (!r.known) return unknown(r.reason);
  const nonLabour = directCostPaise(costs);
  const labour = directLabourCostPaise(log, opts.ratePaisePerHour);
  const includesLabour = labour.known;
  const contributionPaise = r.value - nonLabour - (labour.known ? labour.value : 0);
  return known({
    revenueBasis: basis, revenuePaise: r.value, directNonLabourPaise: nonLabour,
    directLabourPaise: labour.known ? labour.value : null, includesLabour,
    contributionPaise, totalHours: totalHours(log), founderHours: founderHours(log),
  });
}

// ── Unit economics (management metrics, never rankings or pricing) ─────────────────────────────────
export function contributionPerHour(c: Contribution): Known<number> {
  return c.totalHours > 0 ? known(Math.round(c.contributionPaise / c.totalHours)) : unknown('no hours recorded');
}
export function contributionPerFounderHour(c: Contribution): Known<number> {
  return c.founderHours > 0 ? known(Math.round(c.contributionPaise / c.founderHours)) : unknown('no founder hours recorded');
}

// ── Estimate vs actual ─────────────────────────────────────────────────────────────────────────
/** Compare estimated total hours (from the existing implementation_estimate) with actual logged hours. */
export function hoursVariance(estimatedHours: number | null | undefined, log: WorkLogEntry[]): Known<{ estimated: number; actual: number; deltaHours: number }> {
  if (estimatedHours == null) return unknown('no authoritative hours estimate');
  const actual = totalHours(log);
  return known({ estimated: estimatedHours, actual, deltaHours: actual - estimatedHours });
}
/** Compare the 30-day delivery target (delivery_deadline) with the actual go-live date. Neither is invented. */
export function deliveryVariance(deadlineIso: string | null | undefined, goLiveIso: string | null | undefined): Known<{ onTime: boolean; deltaDays: number }> {
  if (!deadlineIso) return unknown('no delivery target recorded');
  if (!goLiveIso) return unknown('not gone live yet');
  const deltaDays = Math.round((Date.parse(goLiveIso) - Date.parse(deadlineIso)) / 86_400_000);
  return known({ onTime: deltaDays <= 0, deltaDays });
}

// ── AMC / post-launch economics — kept separate from build economics ───────────────────────────────
export type AmcMonthly = { contractedPaise?: number | null; collectedPaise?: number | null; techCostPaise?: number | null; log: WorkLogEntry[] };
export type AmcEconomics = { revenueBasis: RevenueBasis; revenuePaise: number; techCostPaise: number; contributionBeforeLabourPaise: number; supportHours: number; founderHours: number };

export function amcMonthlyEconomics(a: AmcMonthly, basis: RevenueBasis = 'collected'): Known<AmcEconomics> {
  const v = basis === 'contracted' ? a.contractedPaise : basis === 'collected' ? a.collectedPaise : null;
  if (v == null) return unknown(`AMC ${basis} revenue not recorded`);
  if (a.techCostPaise == null) return unknown('AMC direct technology cost not recorded');
  const supportHours = a.log.filter((e) => e.category === 'SUPPORT').reduce((s, e) => s + e.hours, 0);
  return known({
    revenueBasis: basis, revenuePaise: v, techCostPaise: a.techCostPaise,
    contributionBeforeLabourPaise: v - a.techCostPaise,
    supportHours, founderHours: founderHours(a.log),
  });
}
