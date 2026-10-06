import { describe, it, expect } from 'vitest';
import { validateBrandFoundation, canTransition, resolveGaps, type BrandFoundation } from '../../src/lib/brand-foundation';

const valid: BrandFoundation = {
  id: 'bf-001',
  brand: 'example',
  status: 'draft',
  version: 1,
  identity: {
    name: 'Example Brand',
    mission: 'to build something great',
    positioning: 'the premium choice',
    category: 'lifestyle',
    primaryColor: '#d9714b',
    accentColor: '#d4af37',
  },
  icp: {
    description: 'affluent urban professionals',
    persona: 'Alex, 35, founder',
    purchasingPower: '₹50k-200k per order',
    geography: 'India, tier-1 cities',
    values: ['quality', 'sustainability', 'community'],
  },
  voice: {
    tone: ['warm', 'authoritative'],
    person: 'first',
    phrases: { always: ['Let\'s talk'], never: ['buy now', 'limited offer'] },
    style: 'plain language, no jargon',
    cta: 'Let\'s talk.',
  },
  visual: {
    displayFont: 'Anton',
    bodyFont: 'Inter',
    spacing: '4px baseline',
    system: 'viratmohan brand tokens',
    logoRules: 'minimum 100px width, white/cream background required',
  },
  claims: [
    {
      claim: 'sustainable materials',
      proof: 'certification from X',
      by: 'founder',
      at: '2024-10-01T00:00:00Z',
    },
  ],
  restrictions: [
    {
      restriction: 'no fast fashion',
      reason: 'brand values',
      by: 'founder',
    },
  ],
  sources: [
    {
      title: 'Brand Book',
      url: '/brand-book.md',
      at: '2024-10-01T00:00:00Z',
    },
  ],
  gaps: ['customer testimonials needed', 'social proof guidelines unclear'],
  owner: 'founder',
  approvedAt: null,
  committedAt: null,
  supersededBy: null,
  createdAt: '2024-10-01T00:00:00Z',
  updatedAt: '2024-10-01T00:00:00Z',
};

describe('Brand Foundation', () => {
  describe('validation', () => {
    it('accepts a valid foundation', () => {
      const r = validateBrandFoundation(valid);
      expect(r.valid).toBe(true);
    });

    it('requires brand key', () => {
      const bad = { ...valid, brand: '' };
      const r = validateBrandFoundation(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('brand'))).toBe(true);
    });

    it('requires valid status', () => {
      const bad = { ...valid, status: 'unknown' };
      const r = validateBrandFoundation(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('status'))).toBe(true);
    });

    it('requires identity with name and mission', () => {
      const bad = { ...valid, identity: { ...valid.identity, name: '' } };
      const r = validateBrandFoundation(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('identity'))).toBe(true);
    });

    it('requires valid hex color', () => {
      const bad = { ...valid, identity: { ...valid.identity, primaryColor: 'red' } };
      const r = validateBrandFoundation(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('primaryColor'))).toBe(true);
    });

    it('requires voice with tone and person', () => {
      const bad = { ...valid, voice: { ...valid.voice, person: 'invalid' } };
      const r = validateBrandFoundation(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('person'))).toBe(true);
    });

    it('requires owner and approvedAt for approved status', () => {
      const bad = { ...valid, status: 'approved', owner: null };
      const r = validateBrandFoundation(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('owner'))).toBe(true);
    });
  });

  describe('transitions', () => {
    it('DRAFT → REVIEW is valid', () => {
      expect(canTransition('draft', 'review')).toBe(true);
    });

    it('REVIEW → APPROVED is valid', () => {
      expect(canTransition('review', 'approved')).toBe(true);
    });

    it('APPROVED → COMMITTED is valid', () => {
      expect(canTransition('approved', 'committed')).toBe(true);
    });

    it('any status can transition to SUPERSEDED', () => {
      expect(canTransition('draft', 'superseded')).toBe(true);
      expect(canTransition('approved', 'superseded')).toBe(true);
      expect(canTransition('committed', 'superseded')).toBe(true);
    });

    it('disallows backward transitions', () => {
      expect(canTransition('committed', 'approved')).toBe(false);
      expect(canTransition('review', 'draft')).toBe(false);
    });

    it('disallows same-status transition', () => {
      expect(canTransition('draft', 'draft')).toBe(false);
      expect(canTransition('approved', 'approved')).toBe(false);
    });

    it('disallows skipped steps', () => {
      expect(canTransition('draft', 'approved')).toBe(false);
      expect(canTransition('draft', 'committed')).toBe(false);
      expect(canTransition('review', 'committed')).toBe(false);
    });
  });

  describe('gap resolution', () => {
    it('removes resolved gaps', () => {
      const gaps = ['testimonials', 'color variants', 'font specs'];
      const resolved = ['testimonials', 'color variants'];
      const result = resolveGaps(gaps, resolved);
      expect(result).toEqual(['font specs']);
    });

    it('preserves unresolved gaps', () => {
      const gaps = ['testimonials', 'color variants'];
      const resolved = ['other-gap'];
      const result = resolveGaps(gaps, resolved);
      expect(result).toEqual(['testimonials', 'color variants']);
    });

    it('handles empty resolved list', () => {
      const gaps = ['testimonials', 'color variants'];
      const result = resolveGaps(gaps, []);
      expect(result).toEqual(gaps);
    });

    it('handles empty gaps list', () => {
      const result = resolveGaps([], ['anything']);
      expect(result).toEqual([]);
    });
  });
});
