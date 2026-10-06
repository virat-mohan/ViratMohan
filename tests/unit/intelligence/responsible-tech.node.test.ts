import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RESPONSIBLE_TECHNOLOGY_POLICY, shouldInvoke } from '../../../src/lib/intelligence/responsible-technology';
import type { InvocationGuard } from '../../../src/lib/intelligence/responsible-technology';
import { summariseModelLearning, MIN_OBSERVATIONS_FOR_RECOMMENDATION } from '../../../src/lib/intelligence/model-learning';
import type { ModelObservation } from '../../../src/lib/intelligence/model-learning';

function makeGuard(overrides: Partial<InvocationGuard> = {}): InvocationGuard {
  return {
    taskId: 't-1', agentId: 'DS-02', modelId: 'claude-sonnet-5-5', reason: 'test',
    estimatedTokens: null, estimatedCostFactor: null,
    aiRequired: true, deterministicAlternativeConsidered: true, cachedResultAvailable: false,
    retryCount: 0, maxRetries: 3, escalationCount: 0, maxEscalations: 3,
    elapsedMinutes: 0, maxElapsedMinutes: 120,
    ...overrides,
  };
}

function makeObs(overrides: Partial<ModelObservation> = {}): ModelObservation {
  return {
    taskId: 't-1', taskType: 'classification', agentId: 'DS-02',
    modelId: 'claude-sonnet-5-5', tier: 'standard', tokens: null,
    costFactor: 10, durationMs: null, qualityResult: 'pass',
    humanCorrectionRequired: false, humanCorrectionDescription: null,
    escalated: false, retries: 0, businessOutcome: null,
    timestamp: '2026-10-06T00:00:00Z',
    ...overrides,
  };
}

describe('Responsible Technology Policy', () => {
  it('has 13 canonical rules', () => {
    assert.equal(RESPONSIBLE_TECHNOLOGY_POLICY.rules.length, 13);
    assert.equal(RESPONSIBLE_TECHNOLOGY_POLICY.rules[0].id, 'RT-01');
    assert.equal(RESPONSIBLE_TECHNOLOGY_POLICY.rules[12].id, 'RT-13');
  });

  it('blocks invocation when AI is not required (RT-01)', () => {
    const result = shouldInvoke(makeGuard({ aiRequired: false }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('RT-01'));
  });

  it('blocks invocation when cached result available (RT-03)', () => {
    const result = shouldInvoke(makeGuard({ cachedResultAvailable: true }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('RT-03'));
  });

  it('blocks invocation at retry limit (RT-07)', () => {
    const result = shouldInvoke(makeGuard({ retryCount: 3, maxRetries: 3 }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('RT-07'));
  });

  it('blocks invocation at escalation limit (RT-08)', () => {
    const result = shouldInvoke(makeGuard({ escalationCount: 3, maxEscalations: 3 }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('RT-08'));
  });

  it('blocks invocation at runtime limit (RT-10)', () => {
    const result = shouldInvoke(makeGuard({ elapsedMinutes: 120, maxElapsedMinutes: 120 }));
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('RT-10'));
  });

  it('allows invocation when all guards pass', () => {
    const result = shouldInvoke(makeGuard());
    assert.equal(result.allowed, true);
  });
});

describe('Model Learning', () => {
  it('returns null for empty observations', () => {
    assert.equal(summariseModelLearning([]), null);
  });

  it('returns insufficient_data below threshold', () => {
    const obs = [makeObs()];
    const result = summariseModelLearning(obs)!;
    assert.equal(result.recommendation, 'insufficient_data');
  });

  it('recommends consider_downgrade for high pass rate', () => {
    const obs = Array.from({ length: 20 }, () => makeObs());
    const result = summariseModelLearning(obs)!;
    assert.equal(result.recommendation, 'consider_downgrade');
    assert.equal(result.passRate, 1);
  });

  it('recommends consider_upgrade for low pass rate', () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ qualityResult: i < 5 ? 'pass' : 'fail', humanCorrectionRequired: i >= 5 }),
    );
    const result = summariseModelLearning(obs)!;
    assert.equal(result.recommendation, 'consider_upgrade');
  });

  it('recommends sufficient for balanced results', () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ qualityResult: i < 8 ? 'pass' : 'fail' }),
    );
    const result = summariseModelLearning(obs)!;
    assert.equal(result.recommendation, 'sufficient');
  });

  it('does NOT silently change model policy', () => {
    const obs = Array.from({ length: 20 }, () => makeObs());
    const result = summariseModelLearning(obs)!;
    assert.equal(result.recommendation, 'consider_downgrade');
    assert.ok(result.reason.includes('may be overpowered'));
  });
});
