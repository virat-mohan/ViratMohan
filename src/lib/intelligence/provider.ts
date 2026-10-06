// The only file allowed to call the Anthropic API. Every production model call goes through gateInvocation here.
import { gateInvocation } from './invocation-gate';
import type { InvocationPermit } from './invocation-gate';
import { OPERATIONS } from './operations';
import { MODEL_REGISTRY } from './models';
import type { OperationId } from './operations';

const MODEL_COST = new Map(MODEL_REGISTRY.map((m) => [m.id, m.costFactor]));
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Models that existing production code already calls. Configured, not probed: nothing here checks the provider at runtime. */
export const PROVIDER_CONFIGURED_MODEL_IDS: string[] = ['claude-sonnet-5', 'claude-opus-5-5'];

/** What the provider reported for one call. null when it reported nothing (an error, or a body without usage). */
export interface InvocationUsage { inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null; cacheWriteTokens: number | null }

/**
 * One attributable model call: company > product > brand > agent > model > operation (hierarchy), what was asked, what
 * it used and how long it took. `costUnits` is the registry's relative cost factor times thousands of tokens: a way to
 * rank calls, NOT currency. Prices are not held in this repo, so no money figure is produced.
 */
export interface InvocationRecord {
  at: string; operation: OperationId; agentId: string | undefined; modelId: string; tier: string | undefined; hierarchy: string[];
  brand: string | null; taskId: string | null; retryCount: number; round: number; status: number | string; durationMs: number;
  usage: InvocationUsage | null; costUnits: number | null;
}

type Sink = (r: InvocationRecord) => void;
const sinks: Sink[] = [];
/** Where records go besides the log line (a table, a metrics service). Returns an unsubscribe function. */
export function onInvocation(sink: Sink): () => void { sinks.push(sink); return () => { const i = sinks.indexOf(sink); if (i >= 0) sinks.splice(i, 1); }; }

async function readUsage(res: Response): Promise<InvocationUsage | null> {
  if (!res.ok) return null;
  try {
    const u = ((await res.clone().json()) as { usage?: Record<string, unknown> }).usage;
    if (!u) return null;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return { inputTokens: n(u.input_tokens), outputTokens: n(u.output_tokens), cacheReadTokens: n(u.cache_read_input_tokens), cacheWriteTokens: n(u.cache_creation_input_tokens) };
  } catch { return null; }
}

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
}): Promise<{ res: Response; modelId: string; permit: InvocationPermit; record: InvocationRecord }> {
  const permit = permitFor(args);
  if (!permit.allowed || !permit.decision) {
    console.error(JSON.stringify({ event: 'model_invocation_blocked', operation: args.operation, reasons: permit.reasons, requires: permit.requires }));
    throw new ModelGateError(args.operation, permit);
  }
  const modelId = permit.decision.selectedModelId;
  const started = Date.now();
  const finish = async (status: number | string, res?: Response): Promise<InvocationRecord> => {
    const usage = res ? await readUsage(res) : null;
    const tokens = usage && usage.inputTokens != null && usage.outputTokens != null ? usage.inputTokens + usage.outputTokens : null;
    const costFactor = permit.decision ? MODEL_COST.get(permit.decision.selectedModelId) ?? null : null;
    const record: InvocationRecord = {
      at: new Date().toISOString(), operation: args.operation, agentId: permit.attribution?.agentId, modelId, tier: permit.decision?.tier,
      hierarchy: permit.attribution?.hierarchy ?? [], brand: args.brand ?? null, taskId: args.taskId ?? null,
      retryCount: args.retryCount ?? 0, round: args.round ?? 0, status, durationMs: Date.now() - started,
      usage, costUnits: tokens != null && costFactor != null ? Math.round((costFactor * tokens) / 10) / 100 : null,
    };
    console.info(JSON.stringify({ event: 'model_invocation', ...record }));
    for (const sink of [...sinks]) { try { sink(record); } catch (e) { console.error('invocation sink failed', e); } }
    return record;
  };
  try {
    const res = await (args.fetchImpl ?? fetch)(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': args.apiKey, 'anthropic-version': API_VERSION },
      body: JSON.stringify({ ...args.body, model: modelId }),
      signal: args.signal,
    });
    const record = await finish(res.status, res);
    return { res, modelId, permit, record };
  } catch (e) {
    await finish(e instanceof Error ? e.name : 'error');
    throw e;
  }
}
