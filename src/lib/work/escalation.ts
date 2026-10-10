// Escalation. Two kinds, neither requires climbing the hierarchy.
//   LATERAL: move directly to the relevant specialist (accountability transfers; the previous
//            owner stays on as supporting so nothing is lost).
//   HUMAN:   authority or coverage is missing. Capture what happened, evidence, impact, risk, what
//            was tried, the decision required, the recommended action and the owner. The accountable
//            owner stays accountable; the item holds (WAITING) until the human answers.
// Human coverage is only Virat, Prince, Khiwani & Co., legal advisers and the brand founder.
// Prince is reached through Virat (ORG-SOP): an escalation to Prince must come from Virat.

import type { Actor, HumanCoverage, Result } from './types';
import { HUMAN_COVERAGE } from './types';
import { fail, ok } from './types';
import { isVirat } from './actors';

export interface HumanEscalationInput {
  to: HumanCoverage;
  coverage_gap: 'authority' | 'coverage';
  what_happened: string;
  evidence_ids: string[];
  impact: string;
  risk: string;
  tried: string[];
  decision_required: string;
  recommended_action: string;
}

const REQUIRED: (keyof HumanEscalationInput)[] = ['what_happened', 'impact', 'risk', 'decision_required', 'recommended_action'];

export function validateHumanEscalation(i: HumanEscalationInput, by: Actor): Result<HumanEscalationInput> {
  if (!HUMAN_COVERAGE.includes(i.to)) return fail('escalation_incomplete', `unknown human coverage "${i.to}"`);
  const missing: string[] = REQUIRED.filter((k) => typeof i[k] !== 'string' || !(i[k] as string).trim());
  if (!Array.isArray(i.evidence_ids) || i.evidence_ids.length === 0) missing.push('evidence');
  if (!Array.isArray(i.tried) || i.tried.length === 0 || i.tried.every((t) => !t.trim())) missing.push('what was tried');
  if (missing.length) return fail('escalation_incomplete', `human escalation is missing: ${missing.join(', ')}`, { missing });
  if (i.coverage_gap !== 'authority' && i.coverage_gap !== 'coverage') return fail('escalation_incomplete', 'say whether authority or coverage is missing');
  if (i.to === 'prince' && !isVirat(by)) return fail('prince_requires_virat', 'Prince is reached through Virat: escalate to Virat and recommend Prince in the recommended action');
  return ok(i);
}
