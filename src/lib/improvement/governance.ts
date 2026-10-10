// Improvement governance — proportional CEO/Myoho review, change control.
// Pure contract: no framework, no network.

import type { Improvement, ImprovementGovernance, ChangeProposal, ImprovementCategory } from './types';

// ── CEO review thresholds ───────────────────────────────────────────────

const CEO_REVIEW_CATEGORIES: ImprovementCategory[] = ['model', 'security', 'platform'];

export function requiresCeoReview(improvement: Improvement): boolean {
  if (CEO_REVIEW_CATEGORIES.includes(improvement.category)) return true;
  if (improvement.priority === 'P0' || improvement.priority === 'P1') return true;
  if (improvement.change_proposal?.risk === 'high') return true;
  if (improvement.change_proposal && !improvement.change_proposal.reversible) return true;
  return false;
}

// ── Myoho review thresholds ─────────────────────────────────────────────

const MYOHO_REVIEW_CATEGORIES: ImprovementCategory[] = ['brand', 'visual'];

export function requiresMyohoReview(improvement: Improvement): boolean {
  if (MYOHO_REVIEW_CATEGORIES.includes(improvement.category)) return true;
  if (improvement.category === 'process' && improvement.change_proposal?.affected_brands.length) return true;
  return false;
}

// ── Founder approval ────────────────────────────────────────────────────

export function requiresFounderApproval(improvement: Improvement): boolean {
  if (improvement.change_proposal && !improvement.change_proposal.reversible) return true;
  if (improvement.change_proposal?.risk === 'high') return true;
  return false;
}

// ── Combined governance check ───────────────────────────────────────────

export function resolveGovernance(improvement: Improvement): ImprovementGovernance {
  const ceo = requiresCeoReview(improvement);
  const myoho = requiresMyohoReview(improvement);
  const founder = requiresFounderApproval(improvement);
  const reasons: string[] = [];
  if (ceo) reasons.push('CEO review required');
  if (myoho) reasons.push('Myoho review required');
  if (founder) reasons.push('Founder approval required');
  return {
    requiresCeoReview: ceo,
    requiresMyohoReview: myoho,
    requiresFounderApproval: founder,
    reason: reasons.join('; ') || 'routine improvement — no special governance',
  };
}

// ── Change proposal validation ──────────────────────────────────────────

export function validateChangeProposal(proposal: ChangeProposal): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!proposal.title.trim()) missing.push('title');
  if (!proposal.description.trim()) missing.push('description');
  if (!proposal.before.trim()) missing.push('before');
  if (!proposal.after.trim()) missing.push('after');
  if (!proposal.affected_systems.length) missing.push('affected_systems');
  return { valid: missing.length === 0, missing };
}

// ── Status transition rules ─────────────────────────────────────────────

import type { ImprovementStatus } from './types';

const VALID_TRANSITIONS: Record<ImprovementStatus, ImprovementStatus[]> = {
  detected: ['analysed'],
  analysed: ['root_caused', 'proposed'],
  root_caused: ['proposed'],
  proposed: ['approved', 'closed'],
  approved: ['implementing'],
  implementing: ['verifying'],
  verifying: ['standardised', 'implementing'],
  standardised: ['closed'],
  closed: [],
};

export function canTransition(from: ImprovementStatus, to: ImprovementStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function requiresApprovalForTransition(to: ImprovementStatus): boolean {
  return to === 'approved' || to === 'implementing';
}
