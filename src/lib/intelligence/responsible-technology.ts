// Responsible Technology Policy — hard canonical rules for every agent/function/process/task.
// Pure contract: no framework, no network.

export const RESPONSIBLE_TECHNOLOGY_POLICY = {
  version: '1.0',
  principle: 'Every AI/software/API/infrastructure/human-supported technical operation must be economically responsible.',
  rules: [
    { id: 'RT-01', rule: 'AI only when AI adds value' },
    { id: 'RT-02', rule: 'Deterministic method preferred where sufficient' },
    { id: 'RT-03', rule: 'Reuse/caching preferred over repeated generation' },
    { id: 'RT-04', rule: 'Cheapest sufficient model preferred' },
    { id: 'RT-05', rule: 'Higher-cost reasoning requires justification' },
    { id: 'RT-06', rule: 'Human review cost is part of the economics' },
    { id: 'RT-07', rule: 'No unlimited retries' },
    { id: 'RT-08', rule: 'No unlimited escalation' },
    { id: 'RT-09', rule: 'No hidden model upgrades' },
    { id: 'RT-10', rule: 'No runaway loops' },
    { id: 'RT-11', rule: 'All material usage must be attributable' },
    { id: 'RT-12', rule: 'High-cost/exceptional model use follows governance' },
    { id: 'RT-13', rule: 'Technology cost must be considered against expected business outcome' },
  ],
  appliesTo: ['CEO', 'CFO', 'CTO', 'CMO', 'CSO', 'COO', 'CHRO', 'Brand CEOs', 'HODs', 'specialists', 'Visual Design & Brand Guardian', 'future agents'],
} as const;

export type ResponsibleTechnologyRule = (typeof RESPONSIBLE_TECHNOLOGY_POLICY.rules)[number];

export interface InvocationGuard {
  taskId: string;
  agentId: string;
  modelId: string;
  reason: string;
  estimatedTokens: number | null;
  estimatedCostFactor: number | null;
  aiRequired: boolean;
  deterministicAlternativeConsidered: boolean;
  cachedResultAvailable: boolean;
  retryCount: number;
  maxRetries: number;
  escalationCount: number;
  maxEscalations: number;
  elapsedMinutes: number;
  maxElapsedMinutes: number;
}

export function shouldInvoke(guard: InvocationGuard): { allowed: boolean; reason: string } {
  if (!guard.aiRequired)
    return { allowed: false, reason: 'RT-01: AI not required for this task' };
  if (guard.cachedResultAvailable)
    return { allowed: false, reason: 'RT-03: Cached result available' };
  if (guard.retryCount >= guard.maxRetries)
    return { allowed: false, reason: `RT-07: Retry limit reached (${guard.retryCount}/${guard.maxRetries})` };
  if (guard.escalationCount >= guard.maxEscalations)
    return { allowed: false, reason: `RT-08: Escalation limit reached (${guard.escalationCount}/${guard.maxEscalations})` };
  if (guard.elapsedMinutes >= guard.maxElapsedMinutes)
    return { allowed: false, reason: `RT-10: Runtime limit reached (${guard.elapsedMinutes}/${guard.maxElapsedMinutes} min)` };
  return { allowed: true, reason: 'Invocation permitted' };
}
