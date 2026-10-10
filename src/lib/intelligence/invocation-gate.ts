// Invocation gate: the single place a model call is approved. Pure contract, no provider calls.
// A provider layer must obtain a permit here and call only permit.decision.selectedModelId.
import { MODEL_REGISTRY, findModel } from './models';
import { routeTask } from './router';
import type { TaskProfile, RoutingDecision, CostAttribution } from './router';
import { buildAttribution } from './router';
import { isRunaway, requiresFableGovernance, validateFableJustification } from './governance';
import type { FableJustification, RunawayCheck } from './governance';
import { shouldInvoke } from './responsible-technology';
import type { InvocationGuard } from './responsible-technology';

export type RequiredAuthority = 'DS-02' | 'DS-01' | 'DS-00';

export interface InvocationRequest {
  task: TaskProfile & { agentId: string };
  guard: Omit<InvocationGuard, 'modelId'>;
  run: RunawayCheck;
  /** Model IDs the runtime has confirmed available. Empty means nothing may be called. */
  confirmedAvailableModelIds: string[];
  /** Per-call ceiling on registry cost factor. Above it: stop and escalate. */
  costCeilingFactor: number;
  fableJustification?: FableJustification;
  /** Authorities that have explicitly approved this call. */
  approvedBy?: RequiredAuthority[];
  attribution?: { taskId?: string; brand?: string; process?: string };
}

export interface InvocationPermit {
  allowed: boolean;
  reasons: string[];
  requires: RequiredAuthority[];
  decision: RoutingDecision | null;
  attribution: CostAttribution | null;
  /** A stronger model never carries more authority. */
  grantsAuthority: false;
}

function blocked(reasons: string[], requires: RequiredAuthority[] = [], decision: RoutingDecision | null = null): InvocationPermit {
  return { allowed: false, reasons, requires, decision, attribution: null, grantsAuthority: false };
}

export function gateInvocation(req: InvocationRequest): InvocationPermit {
  const runaway = isRunaway(req.run);
  if (runaway.runaway) return blocked([`RT-10: runaway stop: ${runaway.reason}`], ['DS-02']);

  const confirmed = MODEL_REGISTRY.filter((m) => req.confirmedAvailableModelIds.includes(m.id)).map((m) => ({ ...m, available: true }));
  if (confirmed.length === 0) return blocked(['No model availability confirmed by the runtime']);

  const decision = routeTask(req.task, confirmed);
  const model = findModel(decision.selectedModelId);
  if (!model || !confirmed.some((m) => m.id === model.id)) return blocked(['Routed model is not confirmed available'], [], decision);

  const guard = shouldInvoke({ ...req.guard, modelId: model.id });
  if (!guard.allowed) return blocked([guard.reason], [], decision);

  const reasons: string[] = [];
  const requires: RequiredAuthority[] = [];

  if (requiresFableGovernance(model.id)) {
    const v = req.fableJustification ? validateFableJustification(req.fableJustification) : { valid: false, missing: ['fableJustification'] };
    if (!v.valid) reasons.push(`RT-12: Fable justification incomplete (${v.missing.join(', ')})`);
    requires.push('DS-02');
  }
  if (model.costFactor > req.costCeilingFactor) {
    reasons.push(`RT-05: cost factor ${model.costFactor} exceeds ceiling ${req.costCeilingFactor}`);
    requires.push('DS-02');
  }
  if (decision.ceoConsultation) requires.push('DS-02');
  if (decision.myohoConsultation) requires.push('DS-01');

  const approved = new Set(req.approvedBy ?? []);
  const missingAuthority = [...new Set(requires)].filter((a) => !approved.has(a));
  if (missingAuthority.length > 0) reasons.push(`Approval required from ${missingAuthority.join(', ')}`);
  if (reasons.length > 0) return blocked(reasons, [...new Set(requires)], decision);

  return {
    allowed: true,
    reasons: [guard.reason],
    requires: [],
    decision,
    attribution: buildAttribution(req.task.agentId, model.id, req.attribution),
    grantsAuthority: false,
  };
}
