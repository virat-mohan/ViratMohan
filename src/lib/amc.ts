import type { EpistemicStatus } from './pnl-levers';

// ---------------------------------------------------------------------------
// 4a — AMC Solution Profile taxonomy (brief §29-56). Fixed classification of
// a delivered solution's ongoing-service shape — this is what the resource-
// hours estimate (4c) and pricing math (4d) are keyed off, never a free-text
// guess.
// ---------------------------------------------------------------------------

export const MECHANISM_TYPES = [
  'agent_workflow', // an AI agent executes a multi-step workflow with some autonomy
  'automation_pipeline', // triggers/data flow through a fixed automated pipeline, little AI judgment
  'decision_support', // surfaces a recommendation, a human decides
  'analytics_dashboard', // reporting/visibility, no direct action taken by the system
  'data_integration', // primarily connects/reconciles data between systems
] as const;
export type MechanismType = (typeof MECHANISM_TYPES)[number];

export const AUTOMATION_LEVELS = [
  'fully_automated', // runs without a human in the loop under normal conditions
  'human_in_loop', // a human approves or intervenes at defined checkpoints
  'human_reviewed', // system proposes, a human always does the final action
  'advisory_only', // system only informs, takes no action itself
] as const;
export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export const DECISION_CRITICALITY = [
  'low', // errors are cheap and easily caught
  'medium', // errors cost real money/time but are recoverable
  'high', // errors are costly, hard to reverse, or customer-facing at scale
  'regulatory', // errors carry compliance/legal exposure
] as const;
export type DecisionCriticality = (typeof DECISION_CRITICALITY)[number];

export type AmcSolutionProfile = {
  business_function: string; // one of BUSINESS_FUNCTIONS
  domain: string; // short, e.g. "e-commerce checkout", "B2B outbound sales"
  problem_type: string; // short, e.g. "funnel conversion", "compliance monitoring"
  framework_name: string; // the framework actually applied (from Step 2)
  mechanism_type: MechanismType;
  workflow_count: number; // distinct triggerable workflows the mechanism runs
  integration_count: number; // distinct external systems/tools it touches
  automation_level: AutomationLevel;
  decision_criticality: DecisionCriticality;
};

// ---------------------------------------------------------------------------
// Resource categories — the 4 buckets of ongoing AMC service intensity.
// ---------------------------------------------------------------------------

export const RESOURCE_CATEGORIES = [
  'fde_client_engagement', // dedicated account manager, satisfaction support, domain-expert calls
  'technical', // model/infra updates, monitoring, integration maintenance
  'sme', // subject-matter-expert oversight specific to the domain/framework
  'ai_optimisation', // prompt/framework advancement, data study vs. original P&L target
] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  fde_client_engagement: 'FDE / Client Engagement',
  technical: 'Technical',
  sme: 'SME (domain expert)',
  ai_optimisation: 'AI / Optimisation',
};

// 4c output shape — per-category monthly hours, each an honest estimate,
// never presented as more certain than it is.
export type AmcResourceHourEstimate = {
  category: ResourceCategory;
  monthly_hours: number;
  status: EpistemicStatus; // known (client/scope-stated), assumed (benchmarked default), needs_confirmation
  rationale: string; // one sentence — what drives this many hours for this category
};

export type AmcResourceEstimate = {
  estimates: AmcResourceHourEstimate[];
  overall_confidence_note: string; // one sentence on how solid this estimate is overall
};

// ---------------------------------------------------------------------------
// 4b — Domain Expert Rate Benchmark: admin-curated, source-cited market
// rates per resource category/domain. Never fabricated by the model — same
// anti-hallucination pattern as the framework library (see resolveFrameworkSelections
// in llm.ts): a rate is only ever used if it's in this curated set, flagged
// UNVERIFIED otherwise rather than silently trusted.
// ---------------------------------------------------------------------------

export type AmcRateBenchmark = {
  id: string;
  resource_category: ResourceCategory;
  domain: string; // e.g. "e-commerce", "B2B SaaS ops", "general" as a fallback
  role_label: string; // e.g. "Senior growth marketer", "ML/automation engineer"
  rate_per_hour_inr: number;
  source: string; // citation — where this rate benchmark comes from
  verified: boolean; // false = provisional, sourced but not yet cross-checked
  note: string | null;
  active: boolean;
  created_at: string;
};

// ---------------------------------------------------------------------------
// 4d — Pricing math. Pure functions, no AI involved — this is what makes the
// number auditable. The AMC is always a RANGE + rationale, never a single
// manufactured "exact" figure, and the ₹50,000/module/month floor is a hard
// business rule applied here, not left to the model to remember.
// ---------------------------------------------------------------------------

export const AMC_MONTHLY_MINIMUM_INR = 50_000;

export type AmcPricingRecommendation = {
  market_equivalent_value_low_inr: number;
  market_equivalent_value_high_inr: number;
  cost_to_serve_inr: number;
  recommended_range_low_inr: number;
  recommended_range_high_inr: number;
  rationale: string;
  used_minimum_floor: boolean;
  unverified_rate_categories: ResourceCategory[]; // categories priced off a non-curated/unverified rate — flag for human review
};

// Internal FTDS cost-to-serve, per resource category, per hour — what it
// actually costs the business to deliver an hour of this category. This is
// NOT a market benchmark (that's AmcRateBenchmark) — it's our own internal
// number, deliberately kept in one place so it's easy for an admin to
// revisit as the team's actual cost structure changes.
export const FTDS_COST_TO_SERVE_INR_PER_HOUR: Record<ResourceCategory, number> = {
  fde_client_engagement: 900,
  technical: 1400,
  sme: 1800,
  ai_optimisation: 1200,
};

function findRate(
  benchmarks: AmcRateBenchmark[],
  category: ResourceCategory,
  domain: string
): AmcRateBenchmark | null {
  const active = benchmarks.filter((b) => b.active && b.resource_category === category);
  const exact = active.find((b) => b.domain.toLowerCase().trim() === domain.toLowerCase().trim());
  if (exact) return exact;
  const fallback = active.find((b) => b.domain.toLowerCase().trim() === 'general');
  return fallback ?? active[0] ?? null;
}

export function calculateAmcPricing(
  profile: Pick<AmcSolutionProfile, 'domain'>,
  estimate: AmcResourceEstimate,
  benchmarks: AmcRateBenchmark[]
): AmcPricingRecommendation {
  let marketLow = 0;
  let marketHigh = 0;
  let costToServe = 0;
  const unverified: ResourceCategory[] = [];

  for (const hourEstimate of estimate.estimates) {
    const rate = findRate(benchmarks, hourEstimate.category, profile.domain);
    costToServe += hourEstimate.monthly_hours * FTDS_COST_TO_SERVE_INR_PER_HOUR[hourEstimate.category];

    if (!rate) {
      // No curated benchmark at all for this category — do not fabricate a
      // number. Fall back to 1.5x internal cost-to-serve as a conservative
      // floor for this category's contribution, and flag it for review.
      marketLow += hourEstimate.monthly_hours * FTDS_COST_TO_SERVE_INR_PER_HOUR[hourEstimate.category] * 1.5;
      marketHigh += hourEstimate.monthly_hours * FTDS_COST_TO_SERVE_INR_PER_HOUR[hourEstimate.category] * 1.5;
      unverified.push(hourEstimate.category);
      continue;
    }
    if (!rate.verified) unverified.push(hourEstimate.category);

    const rateValue = hourEstimate.monthly_hours * rate.rate_per_hour_inr;
    marketLow += rateValue * 0.85;
    marketHigh += rateValue * 1.15;
  }

  const flooredLow = Math.max(marketLow, AMC_MONTHLY_MINIMUM_INR);
  const flooredHigh = Math.max(marketHigh, AMC_MONTHLY_MINIMUM_INR);
  const usedFloor = marketLow < AMC_MONTHLY_MINIMUM_INR;

  const rationale = usedFloor
    ? `Market-equivalent value (₹${Math.round(marketLow).toLocaleString('en-IN')}–₹${Math.round(marketHigh).toLocaleString('en-IN')}/month) fell below the ₹${AMC_MONTHLY_MINIMUM_INR.toLocaleString('en-IN')} per-module minimum, so the minimum applies.`
    : `Based on estimated monthly hours per resource category priced at benchmarked market rates for this domain, against an internal cost-to-serve of ₹${Math.round(costToServe).toLocaleString('en-IN')}/month.`;

  return {
    market_equivalent_value_low_inr: Math.round(marketLow),
    market_equivalent_value_high_inr: Math.round(marketHigh),
    cost_to_serve_inr: Math.round(costToServe),
    recommended_range_low_inr: Math.round(flooredLow),
    recommended_range_high_inr: Math.round(flooredHigh),
    rationale,
    used_minimum_floor: usedFloor,
    unverified_rate_categories: [...new Set(unverified)],
  };
}
