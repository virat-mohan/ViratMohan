// Intelligence governance — Fable restrictions, CEO/Myoho consultation, anti-runaway.
// Pure contract: no provider calls, no network, no framework.

import type { ModelEntry } from './models';
import { findModel } from './models';

// ── Fable governance ─────────────────────────────────────────────────────

export interface FableJustification {
  taskDescription: string;
  reason: string;
  estimatedDurationMinutes: number | null;
  estimatedCostFactor: number | null;
  expectedValue: string;
  whyLowerModelInsufficient: string;
  authorityHolder: string;
}

export function requiresFableGovernance(modelId: string): boolean {
  const m = findModel(modelId);
  return m?.tier === 'specialist';
}

export function validateFableJustification(j: FableJustification): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!j.taskDescription.trim()) missing.push('taskDescription');
  if (!j.reason.trim()) missing.push('reason');
  if (!j.whyLowerModelInsufficient.trim()) missing.push('whyLowerModelInsufficient');
  if (!j.authorityHolder.trim()) missing.push('authorityHolder');
  return { valid: missing.length === 0, missing };
}

// ── CEO consultation rules ───────────────────────────────────────────────

export type ConsultationTrigger =
  | 'exceptional_model_expenditure'
  | 'major_cross_system_use'
  | 'prolonged_autonomous_operation'
  | 'new_model_or_provider'
  | 'repeated_escalations'
  | 'material_quality_cost_tradeoff';

export function requiresCeoConsultation(trigger: ConsultationTrigger): boolean {
  // All triggers require CEO consultation — that is the point.
  return true;
}

/** Routine Haiku/Sonnet routing does NOT require CEO consultation. */
export function isRoutineRouting(modelId: string): boolean {
  const m = findModel(modelId);
  return !!m && (m.tier === 'economy' || m.tier === 'standard');
}

// ── Myoho consultation rules ─────────────────────────────────────────────

export type MyohoTrigger =
  | 'company_principle_issue'
  | 'ethical_issue'
  | 'quality_vs_cost_philosophy'
  | 'strategic_principle'
  | 'exceptional_autonomy';

export function requiresMyohoConsultation(trigger: MyohoTrigger): boolean {
  return true;
}

/** Routine model selection does NOT require Myoho consultation. */
export function isRoutineForMyoho(modelId: string): boolean {
  const m = findModel(modelId);
  return !!m && m.tier !== 'specialist';
}

// ── Anti-runaway ─────────────────────────────────────────────────────────

export interface RunawayCheck {
  totalInvocations: number;
  totalEscalations: number;
  consecutiveFailures: number;
  elapsedMinutes: number;
}

export const RUNAWAY_LIMITS = {
  maxInvocationsPerTask: 20,
  maxEscalationsPerTask: 3,
  maxConsecutiveFailures: 3,
  maxElapsedMinutes: 120,
} as const;

export function isRunaway(check: RunawayCheck): { runaway: boolean; reason: string | null } {
  if (check.totalInvocations >= RUNAWAY_LIMITS.maxInvocationsPerTask)
    return { runaway: true, reason: `${check.totalInvocations} invocations (limit ${RUNAWAY_LIMITS.maxInvocationsPerTask})` };
  if (check.totalEscalations >= RUNAWAY_LIMITS.maxEscalationsPerTask)
    return { runaway: true, reason: `${check.totalEscalations} escalations (limit ${RUNAWAY_LIMITS.maxEscalationsPerTask})` };
  if (check.consecutiveFailures >= RUNAWAY_LIMITS.maxConsecutiveFailures)
    return { runaway: true, reason: `${check.consecutiveFailures} consecutive failures (limit ${RUNAWAY_LIMITS.maxConsecutiveFailures})` };
  if (check.elapsedMinutes >= RUNAWAY_LIMITS.maxElapsedMinutes)
    return { runaway: true, reason: `${check.elapsedMinutes} minutes elapsed (limit ${RUNAWAY_LIMITS.maxElapsedMinutes})` };
  return { runaway: false, reason: null };
}

// ── Quality floors ───────────────────────────────────────────────────────

export interface QualityFloor {
  domain: string;
  minimumTier: 'standard' | 'premium' | 'elite';
  reason: string;
}

export const QUALITY_FLOORS: QualityFloor[] = [
  { domain: 'major-architecture', minimumTier: 'premium', reason: 'Architectural decisions are irreversible and affect the whole system' },
  { domain: 'security-analysis', minimumTier: 'premium', reason: 'Security mistakes have outsized cost' },
  { domain: 'financial-architecture', minimumTier: 'premium', reason: 'Financial logic must be correct first time' },
  { domain: 'brand-system-review', minimumTier: 'premium', reason: 'Brand drift is expensive to fix after publication' },
  { domain: 'cross-system-design', minimumTier: 'elite', reason: 'Multi-system changes require comprehensive reasoning' },
];

export function qualityFloorFor(domain: string): QualityFloor | undefined {
  return QUALITY_FLOORS.find((f) => f.domain === domain);
}
