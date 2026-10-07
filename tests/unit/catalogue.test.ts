import { describe, it, expect } from 'vitest';
import {
  validateProduct,
  variantMarginPercent,
  canProductTransition,
  checkLiveGates,
  type Product,
} from '../../src/lib/catalogue';

const valid: Product = {
  id: 'prod-001',
  brand: 'example',
  name: 'Example Cap',
  nounSingular: 'cap',
  nounPlural: 'caps',
  status: 'draft',
  category: 'Headwear',
  variants: [
    {
      id: 'var-001',
      sku: 'EXM-CAP-001-BLK-S',
      name: 'Black / Small',
      attributes: { color: 'black', size: 'S', material: 'cotton', fit: 'standard', power: '', other: '' },
      costToMake: 150,
      price: 599,
      stock: 50,
      available: true,
      dimensions: { length: 30, width: 20, height: 10, weight: 120 },
      createdAt: '2024-10-01T00:00:00Z',
      updatedAt: '2024-10-01T00:00:00Z',
    },
    {
      id: 'var-002',
      sku: 'EXM-CAP-001-RED-M',
      name: 'Red / Medium',
      attributes: { color: 'red', size: 'M', material: 'cotton', fit: 'standard', power: '', other: '' },
      costToMake: 150,
      price: 599,
      stock: 30,
      available: true,
      dimensions: { length: 30, width: 20, height: 10, weight: 120 },
      createdAt: '2024-10-01T00:00:00Z',
      updatedAt: '2024-10-01T00:00:00Z',
    },
  ],
  creative: {
    imageUrl: 'https://example.com/cap.jpg',
    imageAlt: 'Example cap in black and red',
    shortDescription: 'Premium cotton cap',
    description: 'Comfortable, breathable cotton cap made from organic materials. Perfect for daily wear.',
    why: 'Stay cool and look sharp with our premium cap made from sustainable cotton.',
    instructions: 'Hand wash in cold water, lay flat to dry.',
    relatedSkus: [],
  },
  attributeOptions: {
    color: { label: 'Color', options: ['black', 'red', 'navy'] },
    size: { label: 'Size', options: ['S', 'M', 'L', 'XL'] },
    material: { label: 'Material', options: ['cotton', 'cotton-blend'] },
    fit: { label: 'Fit', options: ['standard', 'relaxed'] },
    power: { label: '', options: [] },
    other: { label: '', options: [] },
  },
  owner: 'founder',
  approvedBy: null,
  approvedAt: null,
  liveSince: null,
  createdAt: '2024-10-01T00:00:00Z',
  updatedAt: '2024-10-01T00:00:00Z',
};

describe('Catalogue', () => {
  describe('Product validation', () => {
    it('accepts a valid product', () => {
      const r = validateProduct(valid);
      expect(r.valid).toBe(true);
    });

    it('requires brand key', () => {
      const bad = { ...valid, brand: '' };
      const r = validateProduct(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('brand'))).toBe(true);
    });

    it('requires product name and nouns', () => {
      const bad = { ...valid, name: '' };
      const r = validateProduct(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('requires valid status', () => {
      const bad = { ...valid, status: 'unknown' };
      const r = validateProduct(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('status'))).toBe(true);
    });

    it('requires at least one variant', () => {
      const bad = { ...valid, variants: [] };
      const r = validateProduct(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('variant'))).toBe(true);
    });

    it('rejects duplicate SKUs', () => {
      const bad = {
        ...valid,
        variants: [valid.variants[0], { ...valid.variants[0], id: 'var-999' }],
      };
      const r = validateProduct(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('duplicate'))).toBe(true);
    });

    it('requires variant price > 0', () => {
      const bad = {
        ...valid,
        variants: [{ ...valid.variants[0], price: 0 }],
      };
      const r = validateProduct(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('price'))).toBe(true);
    });

    it('requires creative with image and why', () => {
      const bad = { ...valid, creative: { ...valid.creative, imageUrl: '' } };
      const r = validateProduct(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('creative'))).toBe(true);
    });

    it('requires approvedBy for live status', () => {
      const bad = { ...valid, status: 'live', approvedBy: null };
      const r = validateProduct(bad);
      expect(r.valid).toBe(false);
      if (!r.valid) expect(r.errors.some((e) => e.includes('approvedBy'))).toBe(true);
    });
  });

  describe('variant margin calculation', () => {
    it('calculates margin percent correctly', () => {
      const margin = variantMarginPercent(valid.variants[0]);
      // cost: 150, price: 599, margin: (599-150)/599 = 449/599 = 74%
      expect(margin).toBe(75); // rounded
    });

    it('returns null for zero price', () => {
      const v = { ...valid.variants[0], price: 0 };
      expect(variantMarginPercent(v)).toBe(null);
    });

    it('returns null for undefined price', () => {
      const v = { ...valid.variants[0], price: undefined as unknown as number };
      expect(variantMarginPercent(v)).toBe(null);
    });

    it('handles high-margin products', () => {
      const v = { ...valid.variants[0], costToMake: 50, price: 500 };
      const margin = variantMarginPercent(v);
      expect(margin).toBe(90); // (500-50)/500 = 90%
    });

    it('handles low-margin products', () => {
      const v = { ...valid.variants[0], costToMake: 550, price: 599 };
      const margin = variantMarginPercent(v);
      expect(margin).toBe(8); // (599-550)/599 = 8%
    });
  });

  describe('product transitions', () => {
    it('DRAFT → REVIEW is valid', () => {
      expect(canProductTransition('draft', 'review')).toBe(true);
    });

    it('REVIEW → APPROVED is valid', () => {
      expect(canProductTransition('review', 'approved')).toBe(true);
    });

    it('APPROVED → LIVE is valid', () => {
      expect(canProductTransition('approved', 'live')).toBe(true);
    });

    it('any status can transition to ARCHIVED', () => {
      expect(canProductTransition('draft', 'archived')).toBe(true);
      expect(canProductTransition('approved', 'archived')).toBe(true);
      expect(canProductTransition('live', 'archived')).toBe(true);
    });

    it('disallows backward transitions', () => {
      expect(canProductTransition('approved', 'review')).toBe(false);
      expect(canProductTransition('live', 'approved')).toBe(false);
    });

    it('disallows same-status transition', () => {
      expect(canProductTransition('draft', 'draft')).toBe(false);
      expect(canProductTransition('live', 'live')).toBe(false);
    });

    it('disallows skipped steps', () => {
      expect(canProductTransition('draft', 'approved')).toBe(false);
      expect(canProductTransition('review', 'live')).toBe(false);
      expect(canProductTransition('draft', 'live')).toBe(false);
    });
  });

  describe('live gates', () => {
    const readyForLive: Product = {
      ...valid,
      status: 'approved',
      approvedBy: 'founder',
      approvedAt: '2024-10-01T00:00:00Z',
    };

    it('passes all gates for a product ready to go live', () => {
      const result = checkLiveGates(readyForLive);
      expect(result.ready).toBe(true);
      expect(result.blocks).toHaveLength(0);
    });

    it('blocks if not approved status', () => {
      const bad = { ...readyForLive, status: 'review' as const } as Product;
      const result = checkLiveGates(bad);
      expect(result.ready).toBe(false);
      expect(result.blocks.some((b) => b.includes('approved'))).toBe(true);
    });

    it('blocks if no variants', () => {
      const bad = { ...readyForLive, variants: [] };
      const result = checkLiveGates(bad);
      expect(result.ready).toBe(false);
      expect(result.blocks.some((b) => b.includes('variant'))).toBe(true);
    });

    it('blocks if variant has invalid price', () => {
      const bad = {
        ...readyForLive,
        variants: [{ ...readyForLive.variants[0], price: 0 }],
      };
      const result = checkLiveGates(bad);
      expect(result.ready).toBe(false);
      expect(result.blocks.some((b) => b.includes('price'))).toBe(true);
    });

    it('blocks if creative incomplete', () => {
      const bad = {
        ...readyForLive,
        creative: { ...readyForLive.creative, why: '' },
      };
      const result = checkLiveGates(bad);
      expect(result.ready).toBe(false);
      expect(result.blocks.some((b) => b.includes('creative'))).toBe(true);
    });

    it('blocks if no approval', () => {
      const bad = { ...readyForLive, approvedBy: null };
      const result = checkLiveGates(bad);
      expect(result.ready).toBe(false);
      expect(result.blocks.some((b) => b.includes('approved'))).toBe(true);
    });

    it('allows multiple valid variants with different prices', () => {
      const multi = {
        ...readyForLive,
        variants: [
          readyForLive.variants[0],
          { ...readyForLive.variants[1], price: 799 },
          { ...readyForLive.variants[0], id: 'var-003', sku: 'EXM-CAP-002-BLK-L' },
        ],
      };
      const result = checkLiveGates(multi);
      expect(result.ready).toBe(true);
    });
  });
});
