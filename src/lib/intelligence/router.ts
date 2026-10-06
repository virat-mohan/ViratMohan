// Model Router / Intelligence Governor — deterministic task-to-model routing.
// Pure contract: no provider calls, no network, no framework.
// A stronger model receives NO additional authority.

import type { ModelEntry, ModelTier } from './models';
import { MODEL_REGISTRY, findModel } from './models';
import type { AutonomyLevel } from './types';

// ── Task classification ──────────────────────────────────────────────────

export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'exceptional';
export type TaskRisk = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface TaskProfile {
  complexity: TaskComplexity;
  risk: TaskRisk;
  /** Number of dependent downstream steps. */
  dependentSteps: number;
  /** Number of distinct systems affected. */
  systemsAffected: number;
  /** Financial or customer impact. */
  materiality: 'negligible' | 'low' | 'moderate' | 'high' | 'critical';
  /** Is the operation reversible? */
  reversible: boolean;
  /** Quality requirement. */
  qualityRequirement: 'best-effort' | 'standard' | 'high' | 'rigorous';
  /** Current autonomy level of the requesting agent. */
  autonomyLevel: AutonomyLevel;
  /** Whether a human will review the result before it takes effect. */
  humanReview: boolean;
  /** Optional: minimum tier override (quality floor). */
  minimumTier?: ModelTier;
  /** Optional: agent ID requesting the work, for defaults lookup. */
  agentId?: string;
}

// ── Agent default policies ───────────────────────────────────────────────

export interface AgentModelPolicy {
  agentId: string;
  defaultModelId: string;
  /** Model IDs allowed for difficult/exceptional work. */
  escalationModelIds: string[];
}

/**
 * Default model policies per agent role. These are STARTING defaults — task requirements override.
 * CEO/Myoho consultation rules apply above these defaults.
 */
export const AGENT_MODEL_DEFAULTS: AgentModelPolicy[] = [
  { agentId: 'DS-02', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-5-5', 'claude-fable-5-1'] },      // CEO Dev
  { agentId: 'DS-01', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-8', 'claude-opus-5-5'] },        // Myoho
  { agentId: 'DS-10', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-7', 'claude-opus-5-5'] },        // Check (QA)
  { agentId: 'DS-11', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-7', 'claude-opus-5-5'] },        // Grow (CMO)
  { agentId: 'DS-12', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-7'] },                           // Deal (CSO)
  { agentId: 'DS-13', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-8', 'claude-opus-5-5'] },        // Books (CFO)
  { agentId: 'DS-14', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-7'] },                           // Care
  { agentId: 'DS-15', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-7'] },                           // Crew (CHRO)
  { agentId: 'DS-16', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5-5'] }, // Visual (Brand Guardian)
  { agentId: 'DS-17', defaultModelId: 'claude-sonnet-5-5', escalationModelIds: ['claude-opus-4-7', 'claude-opus-5-5'] }, // Improve (Process Efficiency)
];

/** Brand CEOs share one policy. */
const BRAND_CEO_DEFAULT: AgentModelPolicy = {
  agentId: '__brand_ceo__',
  defaultModelId: 'claude-sonnet-5-5',
  escalationModelIds: ['claude-opus-4-7', 'claude-opus-5-5'],
};

const BRAND_CEO_IDS = new Set(['MG-01', 'TC-01', 'CK-01', 'FP-01', 'KB-01']);

export function agentPolicy(agentId: string): AgentModelPolicy {
  if (BRAND_CEO_IDS.has(agentId)) return { ...BRAND_CEO_DEFAULT, agentId };
  return AGENT_MODEL_DEFAULTS.find((p) => p.agentId === agentId)
    ?? { agentId, defaultModelId: 'claude-sonnet-5-5', escalationModelIds: [] };
}

// ── Complexity → minimum tier mapping ────────────────────────────────────

const COMPLEXITY_TIER: Record<TaskComplexity, ModelTier> = {
  trivial: 'economy',
  simple: 'economy',
  moderate: 'standard',
  complex: 'premium',
  exceptional: 'elite',
};

const RISK_TIER: Record<TaskRisk, ModelTier> = {
  none: 'economy',
  low: 'economy',
  medium: 'standard',
  high: 'premium',
  critical: 'elite',
};

const MATERIALITY_TIER: Record<string, ModelTier> = {
  negligible: 'economy',
  low: 'economy',
  moderate: 'standard',
  high: 'premium',
  critical: 'elite',
};

const TIER_RANK: Record<ModelTier, number> = { economy: 0, standard: 1, premium: 2, elite: 3, specialist: 4 };

function maxTier(...tiers: ModelTier[]): ModelTier {
  return tiers.reduce((a, b) => TIER_RANK[a] >= TIER_RANK[b] ? a : b, 'economy');
}

// ── Core routing ─────────────────────────────────────────────────────────

export interface RoutingDecision {
  selectedModelId: string;
  selectedModelName: string;
  tier: ModelTier;
  reason: string;
  /** The task needed a higher tier than the agent default. */
  escalated: boolean;
  /** The task was simple enough to use a cheaper model than the agent default. */
  downgraded: boolean;
  /** CEO consultation is recommended for this routing decision. */
  ceoConsultation: boolean;
  /** Myoho consultation is recommended for this routing decision. */
  myohoConsultation: boolean;
  /** Fable governance applies. */
  fableGovernance: boolean;
}

/**
 * Select the least-cost sufficient model for a task.
 * Uses available models when provided; falls back to the full registry.
 */
export function routeTask(task: TaskProfile, models: ModelEntry[] = MODEL_REGISTRY): RoutingDecision {
  const policy = task.agentId ? agentPolicy(task.agentId) : null;
  const defaultModel = policy ? findModel(policy.defaultModelId) : findModel('claude-sonnet-5-5');

  // Determine minimum tier from task factors
  const complexityTier = COMPLEXITY_TIER[task.complexity];
  const riskTier = RISK_TIER[task.risk];
  const materialityTier = MATERIALITY_TIER[task.materiality] ?? 'economy';
  const qualityTier: ModelTier = task.qualityRequirement === 'rigorous' ? 'premium' : task.qualityRequirement === 'high' ? 'standard' : 'economy';

  // Multi-system and multi-step escalation
  const systemsTier: ModelTier = task.systemsAffected >= 4 ? 'elite' : task.systemsAffected >= 2 ? 'premium' : 'economy';
  const stepsTier: ModelTier = task.dependentSteps >= 6 ? 'premium' : 'economy';

  // Irreversibility escalation
  const reversibilityTier: ModelTier = !task.reversible && task.materiality !== 'negligible' ? 'premium' : 'economy';

  // Human review allows downgrade
  const reviewDiscount: ModelTier = task.humanReview ? 'economy' : 'standard';

  let requiredTier = maxTier(complexityTier, riskTier, materialityTier, qualityTier, systemsTier, stepsTier, reversibilityTier);

  // Human review can pull down one tier level if not critical
  if (task.humanReview && TIER_RANK[requiredTier] > 0 && requiredTier !== 'elite' && requiredTier !== 'specialist') {
    const tiers: ModelTier[] = ['economy', 'standard', 'premium', 'elite', 'specialist'];
    requiredTier = tiers[TIER_RANK[requiredTier] - 1];
  }

  // A floor is a hard minimum, applied after the review discount so review can never lower it.
  if (task.minimumTier) requiredTier = maxTier(requiredTier, task.minimumTier);

  // Find the cheapest model at or above the required tier, preferring available ones
  const candidates = models
    .filter((m) => TIER_RANK[m.tier] >= TIER_RANK[requiredTier])
    .sort((a, b) => a.costFactor - b.costFactor);

  const available = candidates.filter((m) => m.available);
  const selected = available[0] ?? candidates[0] ?? defaultModel ?? MODEL_REGISTRY[2]; // Sonnet 5.5 fallback

  const defaultTier = defaultModel?.tier ?? 'standard';
  const escalated = TIER_RANK[selected.tier] > TIER_RANK[defaultTier];
  const downgraded = TIER_RANK[selected.tier] < TIER_RANK[defaultTier];

  // Governance flags
  const isFable = selected.tier === 'specialist';
  const ceoConsultation = isFable || selected.tier === 'elite' || (escalated && task.materiality === 'critical');
  const myohoConsultation = (isFable && !task.reversible) || task.risk === 'critical';

  const reason = `${task.complexity} complexity, ${task.risk} risk, ${task.materiality} materiality → ${requiredTier} tier → ${selected.name}${escalated ? ' (escalated from agent default)' : ''}${downgraded ? ' (downgraded: simpler task)' : ''}`;

  return {
    selectedModelId: selected.id,
    selectedModelName: selected.name,
    tier: selected.tier,
    reason,
    escalated,
    downgraded,
    ceoConsultation,
    myohoConsultation,
    fableGovernance: isFable,
  };
}

// ── Result-based escalation ──────────────────────────────────────────────

export interface EscalationRequest {
  currentModelId: string;
  failureReason: string;
  attemptCount: number;
  task: TaskProfile;
}

/** Maximum escalation attempts before requiring CEO review. */
export const MAX_ESCALATION_ATTEMPTS = 3;
/** Maximum total retry attempts at any single tier. */
export const MAX_RETRIES_PER_TIER = 2;

export interface EscalationResult {
  escalate: boolean;
  nextModelId: string | null;
  reason: string;
  ceoRequired: boolean;
}

/**
 * Determine whether to escalate to a stronger model after a quality failure.
 * Bounded: will not escalate forever.
 */
export function shouldEscalate(req: EscalationRequest, models: ModelEntry[] = MODEL_REGISTRY): EscalationResult {
  if (req.attemptCount >= MAX_ESCALATION_ATTEMPTS) {
    return { escalate: false, nextModelId: null, reason: `Escalation ceiling reached (${MAX_ESCALATION_ATTEMPTS} attempts)`, ceoRequired: true };
  }

  const current = findModel(req.currentModelId);
  if (!current) return { escalate: false, nextModelId: null, reason: 'Unknown current model', ceoRequired: false };

  // Find the next tier up
  const higherModels = models
    .filter((m) => m.costFactor > current.costFactor)
    .sort((a, b) => a.costFactor - b.costFactor);

  const available = higherModels.filter((m) => m.available);
  const next = available[0] ?? higherModels[0];

  if (!next) return { escalate: false, nextModelId: null, reason: 'No higher model available', ceoRequired: true };

  const isFable = next.tier === 'specialist';
  return {
    escalate: true,
    nextModelId: next.id,
    reason: `${current.name} insufficient: ${req.failureReason} → escalating to ${next.name}`,
    ceoRequired: isFable || req.attemptCount >= 2,
  };
}

// ── Cost attribution ─────────────────────────────────────────────────────

export interface CostAttribution {
  agentId: string;
  taskId: string | null;
  modelId: string;
  brand: string | null;
  /** company → product → brand → function → process → task → agent → model → operation */
  hierarchy: string[];
}

export function buildAttribution(agentId: string, modelId: string, opts?: { taskId?: string; brand?: string; process?: string }): CostAttribution {
  const hierarchy = ['devshop', 'retail-os'];
  if (opts?.brand) hierarchy.push(opts.brand);
  hierarchy.push(agentId, modelId);
  if (opts?.process) hierarchy.push(opts.process);
  if (opts?.taskId) hierarchy.push(opts.taskId);
  return { agentId, taskId: opts?.taskId ?? null, modelId, brand: opts?.brand ?? null, hierarchy };
}
