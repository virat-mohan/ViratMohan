import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEARNING_STATES, isProtectedDomain, canPromoteToRule,
  requiresApprovalForRule, toLearning, canTransitionLearning,
} from '../../../src/lib/improvement/learning';
import type { ImprovementLearning } from '../../../src/lib/improvement/learning';

function makeLearning(overrides: Partial<ImprovementLearning> = {}): ImprovementLearning {
  return {
    id: 'l-1', improvement_id: 'imp-1', state: 'observation',
    observation: 'Deploy without checking links broke email', hypothesis: null,
    validation_method: null, validation_evidence_ids: [], validated_at: null,
    rule_text: null, rule_approved_by: null, rule_approved_at: null,
    prevents_recurrence_of: [], created_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z',
    ...overrides,
  };
}

describe('Improvement Learning: OBSERVATION → HYPOTHESIS → VALIDATED LEARNING → RULE', () => {
  it('learning states follow the correct sequence', () => {
    assert.deepEqual([...LEARNING_STATES], ['observation', 'hypothesis', 'validated_learning', 'rule']);
  });

  it('valid transitions follow the lifecycle', () => {
    assert.equal(canTransitionLearning('observation', 'hypothesis'), true);
    assert.equal(canTransitionLearning('hypothesis', 'validated_learning'), true);
    assert.equal(canTransitionLearning('validated_learning', 'rule'), true);
    assert.equal(canTransitionLearning('hypothesis', 'observation'), true);
  });

  it('invalid transitions are rejected', () => {
    assert.equal(canTransitionLearning('observation', 'rule'), false);
    assert.equal(canTransitionLearning('rule', 'observation'), false);
    assert.equal(canTransitionLearning('observation', 'validated_learning'), false);
  });

  it('protected domains are correctly identified', () => {
    assert.equal(isProtectedDomain('brand_foundation'), true);
    assert.equal(isProtectedDomain('brand_book'), true);
    assert.equal(isProtectedDomain('company_policy'), true);
    assert.equal(isProtectedDomain('model_policy'), true);
    assert.equal(isProtectedDomain('financial_controls'), true);
    assert.equal(isProtectedDomain('production_architecture'), true);
    assert.equal(isProtectedDomain('routine_process'), false);
  });

  it('only validated learnings can become rules', () => {
    const obs = makeLearning({ state: 'observation' });
    assert.equal(canPromoteToRule(obs).allowed, false);

    const validated = makeLearning({
      state: 'validated_learning',
      validation_evidence_ids: ['ev-1'],
      rule_text: 'Always check links before sending',
    });
    assert.equal(canPromoteToRule(validated).allowed, true);
  });

  it('requires evidence for promotion', () => {
    const noEvidence = makeLearning({
      state: 'validated_learning', validation_evidence_ids: [],
      rule_text: 'Some rule',
    });
    assert.equal(canPromoteToRule(noEvidence).allowed, false);
  });

  it('requires rule text for promotion', () => {
    const noText = makeLearning({
      state: 'validated_learning', validation_evidence_ids: ['ev-1'],
      rule_text: '',
    });
    assert.equal(canPromoteToRule(noText).allowed, false);
  });

  it('protected domains require Founder approval', () => {
    const result = requiresApprovalForRule(['brand_foundation', 'routine_stuff']);
    assert.equal(result.required, true);
    assert.equal(result.authority, 'DS-00');
  });

  it('routine domains need only CEO approval', () => {
    const result = requiresApprovalForRule(['process_step', 'deployment_check']);
    assert.equal(result.required, false);
    assert.equal(result.authority, 'DS-02');
  });

  it('toLearning converts rule-state learning to Work Registry Learning', () => {
    const rule = makeLearning({
      state: 'rule', rule_text: 'Check links before deploy',
    });
    const learning = toLearning(rule);
    assert.ok(learning);
    assert.equal(learning.lesson, 'Check links before deploy');
    assert.equal(learning.rule_added, true);
    assert.equal(learning.reference, 'imp-1');
  });

  it('toLearning returns null for non-rule state', () => {
    const obs = makeLearning({ state: 'observation' });
    assert.equal(toLearning(obs), null);
  });
});
