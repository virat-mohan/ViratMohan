// Improvement learning — OBSERVATION → HYPOTHESIS → VALIDATED LEARNING → RULE.
// Pure contract: no framework, no network.
// Does NOT silently modify Brand Foundation, Brand Book, company policy, authority,
// model policy, compensation, financial controls, or production architecture.
// Only approved changes become authoritative rules.

import type { Learning } from '../work/types';

export const LEARNING_STATES = ['observation', 'hypothesis', 'validated_learning', 'rule'] as const;
export type LearningState = (typeof LEARNING_STATES)[number];

export interface ImprovementLearning {
  id: string;
  improvement_id: string;
  state: LearningState;
  observation: string;
  hypothesis: string | null;
  validation_method: string | null;
  validation_evidence_ids: string[];
  validated_at: string | null;
  rule_text: string | null;
  rule_approved_by: string | null;
  rule_approved_at: string | null;
  prevents_recurrence_of: string[];
  created_at: string;
  updated_at: string;
}

const PROTECTED_DOMAINS = [
  'brand_foundation', 'brand_book', 'company_policy', 'authority',
  'model_policy', 'compensation', 'financial_controls', 'production_architecture',
] as const;
export type ProtectedDomain = (typeof PROTECTED_DOMAINS)[number];

export function isProtectedDomain(domain: string): boolean {
  return (PROTECTED_DOMAINS as readonly string[]).includes(domain);
}

export function canPromoteToRule(learning: ImprovementLearning): { allowed: boolean; reason: string } {
  if (learning.state !== 'validated_learning')
    return { allowed: false, reason: 'Only validated learnings can become rules' };
  if (!learning.validation_evidence_ids.length)
    return { allowed: false, reason: 'Validation evidence required' };
  if (!learning.rule_text?.trim())
    return { allowed: false, reason: 'Rule text required' };
  return { allowed: true, reason: 'Ready for approval' };
}

export function requiresApprovalForRule(affectedDomains: string[]): { required: boolean; authority: string; reason: string } {
  const protected_ = affectedDomains.filter(isProtectedDomain);
  if (protected_.length > 0)
    return { required: true, authority: 'DS-00', reason: `Affects protected domains: ${protected_.join(', ')}` };
  return { required: false, authority: 'DS-02', reason: 'Routine rule — CEO can approve' };
}

export function toLearning(il: ImprovementLearning): Learning | null {
  if (il.state !== 'rule' || !il.rule_text) return null;
  return { lesson: il.rule_text, reference: il.improvement_id, rule_added: true };
}

const VALID_LEARNING_TRANSITIONS: Record<LearningState, LearningState[]> = {
  observation: ['hypothesis'],
  hypothesis: ['validated_learning', 'observation'],
  validated_learning: ['rule'],
  rule: [],
};

export function canTransitionLearning(from: LearningState, to: LearningState): boolean {
  return VALID_LEARNING_TRANSITIONS[from]?.includes(to) ?? false;
}
