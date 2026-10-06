import { describe, it, expect } from 'vitest';
import { validateBrandMemory, canTransition, checkApprovalGates, type BrandMemory } from '../../src/lib/brand-memory';

const valid: BrandMemory = {
  id: 'bm-001',
  brand: 'example',
  status: 'observation',
  version: 1,
  title: 'Instagram Reels outperform grid posts',
  description: 'Over 3 months, Reels get 3-5x engagement compared to static grid posts on the same account.',
  evidence: [
    {
      source: '@example Instagram Reels analytics',
      finding: '87% of orders trace back to reel clicks',
      at: '2024-10-01T00:00:00Z',
      by: 'analytics review',
    },
  ],
  experiments: [
    {
      hypothesis: 'Increase reels to 5/week instead of 2/week',
      at: '2024-09-01T00:00:00Z',
      sampleSize: '4 weeks, 20 reels',
      result: 'pass',
      finding: 'Orders increased 40%, but team burnout risk detected',
    },
  ],
  domain: 'marketing',
  priority: 'P0',
  rule: null,
  ruleHow: null,
  requiresApproval: true,
  approvedBy: null,
  approvedAt: null,
  supersededBy: null,
  createdAt: '2024-10-01T00:00:00Z',
  updatedAt: '2024-10-01T00:00:00Z',
};

describe('Brand Memory', () => {
  describe('validation', () => {
    it('accepts a valid observation', () => {
      const r = validateBrandMemory(valid);
      expect(r.valid).toBe(true);
    });

    it('requires brand key', () => {
      const bad = { ...valid, brand: '' };
      const r = validateBrandMemory(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('brand'))).toBe(true);
    });

    it('requires valid status', () => {
      const bad = { ...valid, status: 'unknown' };
      const r = validateBrandMemory(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('status'))).toBe(true);
    });

    it('requires title and description', () => {
      const bad = { ...valid, title: '' };
      const r = validateBrandMemory(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('title'))).toBe(true);
    });

    it('requires evidence for non-observation status', () => {
      const bad = { ...valid, status: 'hypothesis', evidence: [] };
      const r = validateBrandMemory(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('evidence'))).toBe(true);
    });

    it('allows empty evidence for observation status', () => {
      const memory = { ...valid, status: 'observation', evidence: [] };
      const r = validateBrandMemory(memory);
      expect(r.valid).toBe(true);
    });

    it('requires rule and ruleHow for approved_rule status', () => {
      const bad = {
        ...valid,
        status: 'approved_rule',
        rule: null,
        ruleHow: null,
        approvedBy: 'founder',
        approvedAt: '2024-10-01T00:00:00Z',
      };
      const r = validateBrandMemory(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('rule'))).toBe(true);
    });

    it('requires approval metadata for approved_rule status', () => {
      const bad = {
        ...valid,
        status: 'approved_rule',
        rule: 'Post reels 5 times per week',
        ruleHow: 'Use content calendar templates',
        approvedBy: null,
        approvedAt: null,
      };
      const r = validateBrandMemory(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('approvedBy'))).toBe(true);
    });
  });

  describe('transitions', () => {
    it('OBSERVATION → HYPOTHESIS is valid', () => {
      expect(canTransition('observation', 'hypothesis')).toBe(true);
    });

    it('HYPOTHESIS → EXPERIMENT is valid', () => {
      expect(canTransition('hypothesis', 'experiment')).toBe(true);
    });

    it('EXPERIMENT → VALIDATED_LEARNING is valid', () => {
      expect(canTransition('experiment', 'validated_learning')).toBe(true);
    });

    it('VALIDATED_LEARNING → APPROVED_RULE is valid', () => {
      expect(canTransition('validated_learning', 'approved_rule')).toBe(true);
    });

    it('disallows backward transitions', () => {
      expect(canTransition('hypothesis', 'observation')).toBe(false);
      expect(canTransition('experiment', 'hypothesis')).toBe(false);
      expect(canTransition('approved_rule', 'validated_learning')).toBe(false);
    });

    it('disallows same-status transition', () => {
      expect(canTransition('observation', 'observation')).toBe(false);
      expect(canTransition('approved_rule', 'approved_rule')).toBe(false);
    });

    it('disallows skipped steps', () => {
      expect(canTransition('observation', 'experiment')).toBe(false);
      expect(canTransition('hypothesis', 'approved_rule')).toBe(false);
      expect(canTransition('experiment', 'approved_rule')).toBe(false);
    });
  });

  describe('approval gates for approved_rule', () => {
    const readyForApproval: BrandMemory = {
      ...valid,
      status: 'validated_learning',
      evidence: [
        {
          source: 'analytics',
          finding: 'reels outperform 3x',
          at: '2024-10-01T00:00:00Z',
          by: 'data',
        },
      ],
      experiments: [
        {
          hypothesis: 'increase reel frequency',
          at: '2024-09-01T00:00:00Z',
          sampleSize: '4 weeks',
          result: 'pass',
          finding: 'orders up 40%',
        },
      ],
      rule: 'Post reels 5 times per week',
      ruleHow: 'Use templates and schedule with Buffer',
      requiresApproval: true,
      approvedBy: null,
      approvedAt: null,
    };

    it('passes all gates for a rule ready to approve', () => {
      const result = checkApprovalGates(readyForApproval);
      expect(result.pass).toBe(true);
      expect(result.blocks).toHaveLength(0);
    });

    it('blocks approval if not validated_learning status', () => {
      const bad = { ...readyForApproval, status: 'experiment' } as BrandMemory;
      const result = checkApprovalGates(bad);
      expect(result.pass).toBe(false);
      expect(result.blocks.some((b) => b.includes('validated_learning'))).toBe(true);
    });

    it('blocks approval if no evidence', () => {
      const bad = { ...readyForApproval, evidence: [] };
      const result = checkApprovalGates(bad);
      expect(result.pass).toBe(false);
      expect(result.blocks.some((b) => b.includes('evidence'))).toBe(true);
    });

    it('blocks approval if no experiments', () => {
      const bad = { ...readyForApproval, experiments: [] };
      const result = checkApprovalGates(bad);
      expect(result.pass).toBe(false);
      expect(result.blocks.some((b) => b.includes('experiment'))).toBe(true);
    });

    it('blocks approval if all experiments failed', () => {
      const bad = {
        ...readyForApproval,
        experiments: [
          {
            hypothesis: 'test',
            at: '2024-09-01T00:00:00Z',
            sampleSize: '1 week',
            result: 'fail',
            finding: 'no improvement',
          },
        ],
      };
      const result = checkApprovalGates(bad);
      expect(result.pass).toBe(false);
      expect(result.blocks.some((b) => b.includes('failing tests'))).toBe(true);
    });

    it('blocks approval if no rule statement', () => {
      const bad = { ...readyForApproval, rule: null };
      const result = checkApprovalGates(bad);
      expect(result.pass).toBe(false);
      expect(result.blocks.some((b) => b.includes('rule'))).toBe(true);
    });

    it('passes if at least one experiment passed', () => {
      const good = {
        ...readyForApproval,
        experiments: [
          {
            hypothesis: 'test 1',
            at: '2024-09-01T00:00:00Z',
            sampleSize: '1 week',
            result: 'fail',
            finding: 'no improvement',
          },
          {
            hypothesis: 'test 2',
            at: '2024-09-08T00:00:00Z',
            sampleSize: '1 week',
            result: 'pass',
            finding: '+40%',
          },
        ],
      };
      const result = checkApprovalGates(good);
      expect(result.pass).toBe(true);
    });
  });
});
