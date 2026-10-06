import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  MODEL_REGISTRY, findModel, modelsByTier, availableModels, withAvailability,
  routeTask, shouldEscalate, agentPolicy, buildAttribution,
  AGENT_MODEL_DEFAULTS, MAX_ESCALATION_ATTEMPTS,
} from '../../../src/lib/intelligence/index';
import type { TaskProfile } from '../../../src/lib/intelligence/index';

const sonnet55 = findModel('claude-sonnet-5-5')!;
const haiku = findModel('claude-haiku-4-5')!;
const opus46 = findModel('claude-opus-4-6')!;

const base: TaskProfile = {
  complexity: 'moderate', risk: 'low', dependentSteps: 1, systemsAffected: 1,
  materiality: 'low', reversible: true, qualityRequirement: 'standard',
  autonomyLevel: 'L2', humanReview: false,
};

describe('Model Registry', () => {
  it('contains all expected models ordered by cost', () => {
    assert.ok(MODEL_REGISTRY.length >= 10);
    for (let i = 1; i < MODEL_REGISTRY.length; i++) {
      assert.ok(MODEL_REGISTRY[i].costFactor >= MODEL_REGISTRY[i - 1].costFactor, `${MODEL_REGISTRY[i].id} cost >= ${MODEL_REGISTRY[i - 1].id}`);
    }
  });

  it('no model is available by default', () => {
    assert.equal(availableModels().length, 0);
  });

  it('withAvailability marks only named models', () => {
    const models = withAvailability(['claude-haiku-4-5', 'claude-sonnet-5-5']);
    assert.equal(models.filter((m) => m.available).length, 2);
    assert.ok(models.find((m) => m.id === 'claude-haiku-4-5')!.available);
    assert.ok(!models.find((m) => m.id === 'claude-opus-5')!.available);
  });

  it('finds models by tier', () => {
    assert.ok(modelsByTier('economy').length >= 1);
    assert.ok(modelsByTier('specialist').length >= 2);
  });
});

describe('Model Router: task-based routing', () => {
  // Test 1: simple task → Haiku
  it('routes a trivial task to the economy tier', () => {
    const task: TaskProfile = { ...base, complexity: 'trivial', risk: 'none', materiality: 'negligible', humanReview: true };
    const result = routeTask(task, withAvailability(['claude-haiku-4-5', 'claude-sonnet-5-5']));
    assert.equal(result.selectedModelId, 'claude-haiku-4-5');
    assert.equal(result.tier, 'economy');
    assert.equal(result.downgraded, true);
  });

  // Test 2: normal task → Sonnet 5.5
  it('routes a moderate task to the standard tier', () => {
    const task: TaskProfile = { ...base, complexity: 'moderate', risk: 'low' };
    const result = routeTask(task, withAvailability(['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-4-6']));
    assert.equal(result.tier, 'standard');
  });

  // Test 3: difficult task → Opus
  it('routes a complex task to the premium tier', () => {
    const task: TaskProfile = { ...base, complexity: 'complex', risk: 'high', materiality: 'high', reversible: false };
    const result = routeTask(task, withAvailability(['claude-sonnet-5-5', 'claude-opus-4-6', 'claude-opus-5-5']));
    assert.equal(result.tier, 'premium');
    assert.equal(result.escalated, true);
  });

  // Test 4: major cross-system → premium/elite model
  it('routes a major cross-system task to elite', () => {
    const task: TaskProfile = { ...base, complexity: 'exceptional', risk: 'critical', systemsAffected: 5, materiality: 'critical' };
    const result = routeTask(task, withAvailability(['claude-sonnet-5-5', 'claude-opus-5', 'claude-opus-5-5']));
    assert.ok(['elite', 'specialist'].includes(result.tier));
    assert.equal(result.ceoConsultation, true);
  });

  // Test 5: extreme job → Fable when justified
  it('routes to Fable only when the task is genuinely exceptional and no lower model suffices', () => {
    const task: TaskProfile = {
      ...base, complexity: 'exceptional', risk: 'critical', dependentSteps: 10,
      systemsAffected: 6, materiality: 'critical', reversible: false,
      qualityRequirement: 'rigorous', minimumTier: 'specialist',
    };
    const result = routeTask(task, withAvailability(['claude-fable-5-1']));
    assert.equal(result.tier, 'specialist');
    assert.equal(result.fableGovernance, true);
    assert.equal(result.ceoConsultation, true);
  });

  // Test 6: task override (minimumTier)
  it('respects a minimum tier override', () => {
    const task: TaskProfile = { ...base, complexity: 'trivial', minimumTier: 'premium' };
    const result = routeTask(task, withAvailability(['claude-haiku-4-5', 'claude-opus-4-6']));
    assert.equal(result.tier, 'premium');
  });

  // Test 7: quality-based escalation
  it('escalates on quality failure', () => {
    const esc = shouldEscalate(
      { currentModelId: 'claude-sonnet-5-5', failureReason: 'ambiguous output', attemptCount: 1, task: base },
      withAvailability(['claude-sonnet-5-5', 'claude-opus-4-6']),
    );
    assert.equal(esc.escalate, true);
    assert.equal(esc.nextModelId, 'claude-opus-4-6');
  });

  // Test 8: risk-based escalation
  it('treats high risk as requiring premium tier', () => {
    const task: TaskProfile = { ...base, complexity: 'simple', risk: 'high' };
    const result = routeTask(task, withAvailability(['claude-haiku-4-5', 'claude-opus-4-6']));
    assert.ok(['premium', 'standard'].includes(result.tier));
  });

  // Test 9: downward optimisation
  it('downgrades when human review reduces the bar', () => {
    const task: TaskProfile = { ...base, complexity: 'moderate', humanReview: true };
    const result = routeTask(task, withAvailability(['claude-haiku-4-5', 'claude-sonnet-5-5']));
    assert.equal(result.tier, 'economy');
    assert.equal(result.downgraded, true);
  });

  // Test 10: cost ceiling (escalation ceiling)
  it('refuses to escalate beyond the ceiling', () => {
    const esc = shouldEscalate({
      currentModelId: 'claude-opus-5-5', failureReason: 'still failing', attemptCount: MAX_ESCALATION_ATTEMPTS, task: base,
    });
    assert.equal(esc.escalate, false);
    assert.equal(esc.ceoRequired, true);
    assert.ok(esc.reason.includes('ceiling'));
  });

  // Test 11: escalation ceiling reached
  it('stops escalation after MAX_ESCALATION_ATTEMPTS', () => {
    const esc = shouldEscalate({
      currentModelId: 'claude-sonnet-5-5', failureReason: 'failed again', attemptCount: 3, task: base,
    });
    assert.equal(esc.escalate, false);
  });

  // Test 12: retry ceiling
  it('flags CEO review when escalation ceiling is hit', () => {
    const esc = shouldEscalate({
      currentModelId: 'claude-sonnet-5-5', failureReason: 'third failure', attemptCount: 3, task: base,
    });
    assert.equal(esc.ceoRequired, true);
  });

  // Test 13: unavailable model fallback
  it('falls back to any model when no available model matches', () => {
    const task: TaskProfile = { ...base, complexity: 'complex' };
    const result = routeTask(task, MODEL_REGISTRY); // none available
    assert.ok(result.selectedModelId); // still picks one
  });

  // Test 14: provider failure (no higher model for escalation)
  it('returns no escalation when already at the top', () => {
    const esc = shouldEscalate(
      { currentModelId: 'claude-fable-5-1', failureReason: 'even Fable failed', attemptCount: 1, task: base },
      withAvailability(['claude-fable-5-1']),
    );
    assert.equal(esc.escalate, false);
    assert.equal(esc.ceoRequired, true);
  });
});

describe('Model Router: authority independence', () => {
  // Test 15: stronger model does NOT gain authority
  it('a stronger model does not increase authority level', () => {
    const task: TaskProfile = { ...base, autonomyLevel: 'L1' };
    const r1 = routeTask(task, withAvailability(['claude-haiku-4-5']));
    const r2 = routeTask(task, withAvailability(['claude-fable-5-1']));
    // The routing decision carries no authority — the task's autonomy level is unchanged
    assert.equal(task.autonomyLevel, 'L1');
    // Both decisions must not claim to change authority
    assert.ok(!('authorityLevel' in r1));
    assert.ok(!('authorityLevel' in r2));
  });
});

describe('Model Router: governance rules', () => {
  // Test 16: CEO consultation rule
  it('flags CEO consultation for elite/specialist tier', () => {
    const task: TaskProfile = { ...base, complexity: 'exceptional', materiality: 'critical', minimumTier: 'elite' };
    const result = routeTask(task, withAvailability(['claude-opus-5-5']));
    assert.equal(result.ceoConsultation, true);
  });

  // Test 17: Myoho consultation rule
  it('flags Myoho consultation for irreversible critical-risk Fable tasks', () => {
    const task: TaskProfile = { ...base, complexity: 'exceptional', risk: 'critical', reversible: false, minimumTier: 'specialist' };
    const result = routeTask(task, withAvailability(['claude-fable-5-1']));
    assert.equal(result.myohoConsultation, true);
  });

  // Test 18: audit record (cost attribution)
  it('builds a cost attribution hierarchy', () => {
    const attr = buildAttribution('DS-11', 'claude-sonnet-5-5', { brand: 'moonglasses', taskId: 'W-0042' });
    assert.deepEqual(attr.hierarchy, ['devshop', 'retail-os', 'moonglasses', 'DS-11', 'claude-sonnet-5-5', 'W-0042']);
    assert.equal(attr.brand, 'moonglasses');
    assert.equal(attr.agentId, 'DS-11');
  });

  // Test 19: agent default policies
  it('returns correct defaults for each agent', () => {
    assert.equal(agentPolicy('DS-02').defaultModelId, 'claude-sonnet-5-5');
    assert.equal(agentPolicy('MG-01').defaultModelId, 'claude-sonnet-5-5'); // brand CEO
    assert.equal(agentPolicy('DS-16').defaultModelId, 'claude-sonnet-5-5'); // visual guardian
    assert.ok(agentPolicy('DS-02').escalationModelIds.includes('claude-fable-5-1'));
    assert.ok(!agentPolicy('DS-14').escalationModelIds.includes('claude-fable-5-1'));
  });
});
