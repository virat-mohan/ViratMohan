// Model Registry — the single source of truth for model characteristics.
// Pure data: no provider calls, no network, no framework.

export type ModelTier = 'economy' | 'standard' | 'premium' | 'elite' | 'specialist';

export interface ModelEntry {
  id: string;
  name: string;
  tier: ModelTier;
  /** Relative cost factor (1 = baseline Haiku). Approximate, for routing decisions only. */
  costFactor: number;
  strengths: string[];
  /** When true, the model is known to be available to the runtime. Defaults to false until confirmed. */
  available: boolean;
}

/**
 * Central model registry. Ordered by cost factor ascending.
 * `available` is false by default — the runtime must confirm availability before routing to a model.
 * Cost factors are approximate relative ratios for routing decisions, not billing.
 */
export const MODEL_REGISTRY: ModelEntry[] = [
  { id: 'claude-haiku-4-5', name: 'Haiku 4.5', tier: 'economy', costFactor: 1, strengths: ['fast', 'simple-classification', 'repetitive-tasks', 'low-latency'], available: false },
  { id: 'claude-sonnet-5', name: 'Sonnet 5', tier: 'standard', costFactor: 4, strengths: ['general-development', 'moderate-reasoning'], available: false },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', tier: 'standard', costFactor: 6, strengths: ['daily-development', 'general-purpose', 'good-reasoning'], available: false },
  { id: 'claude-opus-4-6', name: 'Opus 4.6', tier: 'premium', costFactor: 20, strengths: ['senior-reasoning', 'debugging', 'complex-analysis'], available: false },
  { id: 'claude-opus-4-7', name: 'Opus 4.7', tier: 'premium', costFactor: 25, strengths: ['architecture', 'advanced-reasoning', 'strategy'], available: false },
  { id: 'claude-opus-4-8', name: 'Opus 4.8', tier: 'premium', costFactor: 30, strengths: ['senior-architecture', 'financial-reasoning', 'security'], available: false },
  { id: 'claude-opus-5', name: 'Opus 5', tier: 'elite', costFactor: 40, strengths: ['cross-system-architecture', 'major-design'], available: false },
  { id: 'claude-opus-5-5', name: 'Opus 5.5', tier: 'elite', costFactor: 50, strengths: ['premium-coding', 'agentic-work', 'complex-multi-step'], available: false },
  { id: 'claude-fable-5', name: 'Fable 5', tier: 'specialist', costFactor: 80, strengths: ['autonomous-specialist', 'long-running', 'high-consequence'], available: false },
  { id: 'claude-fable-5-1', name: 'Fable 5.1', tier: 'specialist', costFactor: 100, strengths: ['maximum-autonomy', 'extreme-reasoning', 'multi-system'], available: false },
];

export function findModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function modelsByTier(tier: ModelTier): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.tier === tier);
}

export function availableModels(): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.available);
}

/** Returns a copy of the registry with the given model IDs marked available. */
export function withAvailability(ids: string[]): ModelEntry[] {
  const set = new Set(ids);
  return MODEL_REGISTRY.map((m) => ({ ...m, available: set.has(m.id) }));
}
