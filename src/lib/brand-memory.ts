// Brand Memory: learnings from running the brand, validated over time.
// Lifecycle: OBSERVATION → HYPOTHESIS → EXPERIMENT → VALIDATED_LEARNING → APPROVED_RULE
// Used to improve brand decisions, operations, and marketing continuously.
// Pure types and validators, no network or framework.

export type BrandMemoryStatus = 'observation' | 'hypothesis' | 'experiment' | 'validated_learning' | 'approved_rule';

export interface BrandMemoryEvidence {
  /** Where this came from: a post, a campaign result, a customer conversation, a health check */
  source: string;
  /** The fact or number: qualitative or quantified */
  finding: string;
  /** When it was observed */
  at: string;
  /** Who observed it */
  by: string;
}

export interface BrandMemoryExperiment {
  /** What was tested */
  hypothesis: string;
  /** When the test ran or is planned */
  at: string;
  /** How many observations / over what period / on what sample */
  sampleSize: string;
  /** Pass or fail */
  result: 'pass' | 'fail' | 'inconclusive';
  /** Why: explain the result */
  finding: string;
}

export interface BrandMemory {
  id: string;
  brand: string; // brand key in central registry
  status: BrandMemoryStatus;
  version: number;

  /** The observation or learning title */
  title: string;
  /** Full description of what was learned */
  description: string;

  /** How this became a learning: the evidence trail */
  evidence: BrandMemoryEvidence[];

  /** Hypotheses tested against this observation */
  experiments: BrandMemoryExperiment[];

  /** If status is approved_rule, the rule statement */
  rule: string | null;
  /** If status is approved_rule, how to follow it */
  ruleHow: string | null;

  /** Domain: e.g., "marketing", "product", "operations", "content" */
  domain: string;
  /** Priority: P0 (must-follow) to P3 (nice-to-know) */
  priority: 'P0' | 'P1' | 'P2' | 'P3';

  /** Can move to next status only if gates pass (e.g., approved_rule needs Virat approval) */
  requiresApproval: boolean;
  /** Who approved the transition to current status */
  approvedBy: string | null;
  approvedAt: string | null;

  /** Superseded by a newer learning */
  supersededBy: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Validate a Brand Memory object for basic shape and required fields.
 */
export function validateBrandMemory(
  memory: unknown,
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!memory || typeof memory !== 'object') {
    return { valid: false, errors: ['not an object'] };
  }

  const m = memory as Record<string, unknown>;
  if (typeof m.brand !== 'string' || !m.brand) errors.push('brand key required');
  if (typeof m.status !== 'string' || !(['observation', 'hypothesis', 'experiment', 'validated_learning', 'approved_rule'] as string[]).includes(m.status)) {
    errors.push('status must be one of: observation, hypothesis, experiment, validated_learning, approved_rule');
  }
  if (typeof m.title !== 'string' || !m.title) errors.push('title required');
  if (typeof m.description !== 'string' || !m.description) errors.push('description required');
  if (typeof m.domain !== 'string' || !m.domain) errors.push('domain required');

  // Evidence: must have at least one for non-observation status
  if (m.status !== 'observation') {
    if (!Array.isArray(m.evidence) || (m.evidence as unknown[]).length === 0) {
      errors.push('evidence required for non-observation status');
    }
  }

  // Approved rule needs rule statement
  if (m.status === 'approved_rule') {
    if (typeof m.rule !== 'string' || !m.rule) errors.push('rule statement required for approved_rule status');
    if (!m.approvedBy || !m.approvedAt) errors.push('approvedBy and approvedAt required for approved_rule status');
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Can this memory transition to a new status?
 * Valid transitions: OBSERVATION → HYPOTHESIS → EXPERIMENT → VALIDATED_LEARNING → APPROVED_RULE
 * Must move to adjacent next status only, no skipping steps.
 */
export function canTransition(from: BrandMemoryStatus, to: BrandMemoryStatus): boolean {
  if (from === to) return false;
  const order = ['observation', 'hypothesis', 'experiment', 'validated_learning', 'approved_rule'];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  return toIdx === fromIdx + 1; // can only move to next adjacent status
}

/**
 * Gates that must be met before allowing a transition to approved_rule.
 * Returns { pass: true } or { pass: false; blocks: string[] }
 */
export function checkApprovalGates(memory: BrandMemory): { pass: boolean; blocks: string[] } {
  const blocks: string[] = [];

  if (memory.status !== 'validated_learning') {
    blocks.push('must be validated_learning before approval');
  }

  if (!memory.evidence || memory.evidence.length === 0) {
    blocks.push('must have evidence');
  }

  if (!memory.experiments || memory.experiments.length === 0) {
    blocks.push('must have at least one experiment');
  } else {
    const passed = memory.experiments.filter((e) => e.result === 'pass');
    if (passed.length === 0) {
      blocks.push('no experiments passed: cannot approve a rule with only failing tests');
    }
  }

  if (!memory.rule || !memory.ruleHow) {
    blocks.push('rule and ruleHow statements required');
  }

  return blocks.length === 0 ? { pass: true, blocks: [] } : { pass: false, blocks };
}
