import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gateInvocation } from '../../../src/lib/intelligence/invocation-gate';
import type { InvocationRequest } from '../../../src/lib/intelligence/invocation-gate';

function req(over: Partial<InvocationRequest> = {}): InvocationRequest {
  return {
    task: {
      agentId: 'DS-02', complexity: 'simple', risk: 'low', dependentSteps: 0, systemsAffected: 1,
      materiality: 'low', reversible: true, qualityRequirement: 'standard', autonomyLevel: 'L1', humanReview: true,
    } as InvocationRequest['task'],
    guard: {
      taskId: 't-1', agentId: 'DS-02', reason: 'test', estimatedTokens: null, estimatedCostFactor: null,
      aiRequired: true, deterministicAlternativeConsidered: true, cachedResultAvailable: false,
      retryCount: 0, maxRetries: 3, escalationCount: 0, maxEscalations: 3, elapsedMinutes: 0, maxElapsedMinutes: 120,
    },
    run: { totalInvocations: 0, totalEscalations: 0, consecutiveFailures: 0, elapsedMinutes: 0 },
    confirmedAvailableModelIds: ['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'],
    costCeilingFactor: 50,
    ...over,
  };
}

describe('invocation gate', () => {
  it('blocks every call when the runtime has confirmed no model', () => {
    const p = gateInvocation(req({ confirmedAvailableModelIds: [] }));
    assert.equal(p.allowed, false);
    assert.equal(p.decision, null);
  });

  it('permits a routine call with attribution and a confirmed model', () => {
    const p = gateInvocation(req());
    assert.equal(p.allowed, true);
    assert.ok(p.decision && req().confirmedAvailableModelIds.includes(p.decision.selectedModelId));
    assert.equal(p.attribution?.agentId, 'DS-02');
    assert.equal(p.attribution?.modelId, p.decision?.selectedModelId);
  });

  it('never routes to a model the runtime has not confirmed', () => {
    const p = gateInvocation(req({ confirmedAvailableModelIds: ['claude-haiku-4-5'] }));
    if (p.decision) assert.equal(p.decision.selectedModelId, 'claude-haiku-4-5');
  });

  it('blocks when AI is not required (RT-01) and when a cached result exists (RT-03)', () => {
    const a = gateInvocation(req({ guard: { ...req().guard, aiRequired: false } }));
    assert.equal(a.allowed, false);
    assert.ok(a.reasons[0].includes('RT-01'));
    const b = gateInvocation(req({ guard: { ...req().guard, cachedResultAvailable: true } }));
    assert.ok(b.reasons[0].includes('RT-03'));
  });

  it('stops a runaway before routing (RT-10) and requires the CEO', () => {
    const p = gateInvocation(req({ run: { totalInvocations: 20, totalEscalations: 0, consecutiveFailures: 0, elapsedMinutes: 0 } }));
    assert.equal(p.allowed, false);
    assert.deepEqual(p.requires, ['DS-02']);
    assert.equal(p.decision, null);
  });

  it('blocks above the cost ceiling until the CEO approves', () => {
    const hard = { complexity: 'exceptional', risk: 'critical', materiality: 'critical', qualityRequirement: 'rigorous', reversible: false, humanReview: false, systemsAffected: 5, dependentSteps: 8 } as const;
    const blockedP = gateInvocation(req({ task: { ...req().task, ...hard }, costCeilingFactor: 10 }));
    assert.equal(blockedP.allowed, false);
    assert.ok(blockedP.requires.includes('DS-02'));
  });

  it('a stronger model grants no authority', () => {
    const p = gateInvocation(req());
    assert.equal(p.grantsAuthority, false);
  });
});
