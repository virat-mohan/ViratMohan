// Model learning — task→model→quality→cost observation structure.
// Pure contract: no framework, no network. Does NOT silently change model policy.

export interface ModelObservation {
  taskId: string;
  taskType: string;
  agentId: string;
  modelId: string;
  tier: string;
  tokens: number | null;
  costFactor: number;
  durationMs: number | null;
  qualityResult: 'pass' | 'fail' | 'partial' | 'unknown';
  humanCorrectionRequired: boolean;
  humanCorrectionDescription: string | null;
  escalated: boolean;
  retries: number;
  businessOutcome: string | null;
  timestamp: string;
}

export interface ModelLearning {
  taskType: string;
  modelId: string;
  observations: number;
  passRate: number;
  avgCostFactor: number;
  humanCorrectionRate: number;
  escalationRate: number;
  recommendation: 'sufficient' | 'consider_downgrade' | 'consider_upgrade' | 'insufficient_data';
  reason: string;
}

export const MIN_OBSERVATIONS_FOR_RECOMMENDATION = 10;

export function summariseModelLearning(observations: ModelObservation[]): ModelLearning | null {
  if (observations.length === 0) return null;

  const taskType = observations[0].taskType;
  const modelId = observations[0].modelId;
  const passes = observations.filter((o) => o.qualityResult === 'pass').length;
  const corrections = observations.filter((o) => o.humanCorrectionRequired).length;
  const escalations = observations.filter((o) => o.escalated).length;
  const avgCost = observations.reduce((s, o) => s + o.costFactor, 0) / observations.length;
  const passRate = passes / observations.length;
  const correctionRate = corrections / observations.length;
  const escalationRate = escalations / observations.length;

  let recommendation: ModelLearning['recommendation'] = 'insufficient_data';
  let reason = `${observations.length} observations (need ${MIN_OBSERVATIONS_FOR_RECOMMENDATION})`;

  if (observations.length >= MIN_OBSERVATIONS_FOR_RECOMMENDATION) {
    if (passRate >= 0.95 && correctionRate <= 0.05) {
      recommendation = 'consider_downgrade';
      reason = `Pass rate ${(passRate * 100).toFixed(0)}%, correction rate ${(correctionRate * 100).toFixed(0)}% — may be overpowered for this task type`;
    } else if (passRate < 0.7 || correctionRate > 0.3) {
      recommendation = 'consider_upgrade';
      reason = `Pass rate ${(passRate * 100).toFixed(0)}%, correction rate ${(correctionRate * 100).toFixed(0)}% — may be underpowered`;
    } else {
      recommendation = 'sufficient';
      reason = `Pass rate ${(passRate * 100).toFixed(0)}%, balanced for this task type`;
    }
  }

  return { taskType, modelId, observations: observations.length, passRate, avgCostFactor: avgCost, humanCorrectionRate: correctionRate, escalationRate, recommendation, reason };
}
