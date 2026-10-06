// The only file allowed to call the Anthropic API. Every production model call goes through gateInvocation here.
import { gateInvocation } from './invocation-gate';
import type { InvocationPermit } from './invocation-gate';
import { OPERATIONS } from './operations';
import type { OperationId } from './operations';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Models that existing production code already calls. Configured, not probed: nothing here checks the provider at runtime. */
export const PROVIDER_CONFIGURED_MODEL_IDS: string[] = ['claude-sonnet-5', 'claude-opus-5-5'];

export class ModelGateError extends Error {
  constructor(public readonly operation: OperationId, public readonly permit: InvocationPermit) {
    super(`Model gate blocked ${operation}: ${permit.reasons.join('; ')}`);
    this.name = 'ModelGateError';
  }
}

export interface GovernedCallOptions {
  operation: OperationId;
  retryCount?: number;
  /** Zero-based round within a multi-round operation (counts toward the invocation limit). */
  round?: number;
  brand?: string;
  taskId?: string;
  confirmedModelIds?: string[];
}

export function permitFor(opts: GovernedCallOptions): InvocationPermit {
  const spec = OPERATIONS[opts.operation];
  return gateInvocation({
    task: { ...spec.profile, agentId: spec.agentId },
    guard: {
      taskId: opts.taskId ?? opts.operation, agentId: spec.agentId, reason: opts.operation,
      estimatedTokens: null, estimatedCostFactor: null,
      aiRequired: true, deterministicAlternativeConsidered: true, cachedResultAvailable: false,
      retryCount: opts.retryCount ?? 0, maxRetries: 3, escalationCount: 0, maxEscalations: 3, elapsedMinutes: 0, maxElapsedMinutes: 120,
    },
    run: { totalInvocations: opts.round ?? 0, totalEscalations: 0, consecutiveFailures: opts.retryCount ?? 0, elapsedMinutes: 0 },
    confirmedAvailableModelIds: opts.confirmedModelIds ?? PROVIDER_CONFIGURED_MODEL_IDS,
    costCeilingFactor: spec.costCeilingFactor,
    approvedBy: spec.standingApproval,
    attribution: { brand: opts.brand, taskId: opts.taskId, process: opts.operation },
  });
}

/** The model an operation routes to right now. Throws if the gate would block it. */
export function resolveOperationModel(operation: OperationId, confirmedModelIds?: string[]): string {
  const permit = permitFor({ operation, confirmedModelIds });
  if (!permit.allowed || !permit.decision) throw new ModelGateError(operation, permit);
  return permit.decision.selectedModelId;
}

export async function governedMessages(args: GovernedCallOptions & {
  apiKey: string;
  /** The request body without `model`; the gate chooses it. */
  body: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ res: Response; modelId: string; permit: InvocationPermit }> {
  const permit = permitFor(args);
  if (!permit.allowed || !permit.decision) {
    console.error(JSON.stringify({ event: 'model_invocation_blocked', operation: args.operation, reasons: permit.reasons, requires: permit.requires }));
    throw new ModelGateError(args.operation, permit);
  }
  const modelId = permit.decision.selectedModelId;
  const started = Date.now();
  const log = (status: number | string) => console.info(JSON.stringify({
    event: 'model_invocation', operation: args.operation, agentId: permit.attribution?.agentId, modelId, tier: permit.decision?.tier,
    hierarchy: permit.attribution?.hierarchy, retryCount: args.retryCount ?? 0, round: args.round ?? 0, status, durationMs: Date.now() - started,
  }));
  try {
    const res = await (args.fetchImpl ?? fetch)(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': args.apiKey, 'anthropic-version': API_VERSION },
      body: JSON.stringify({ ...args.body, model: modelId }),
      signal: args.signal,
    });
    log(res.status);
    return { res, modelId, permit };
  } catch (e) {
    log(e instanceof Error ? e.name : 'error');
    throw e;
  }
}
