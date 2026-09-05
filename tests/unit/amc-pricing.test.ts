import { describe, it, expect } from 'vitest';
import { calculateAmcPricing, AMC_MONTHLY_MINIMUM_INR, type AmcRateBenchmark, type AmcResourceEstimate } from '../../src/lib/amc';

function rate(overrides: Partial<AmcRateBenchmark>): AmcRateBenchmark {
  return {
    id: 'r1',
    resource_category: 'technical',
    domain: 'general',
    role_label: 'Engineer',
    rate_per_hour_inr: 2000,
    source: 'Test source',
    verified: true,
    note: null,
    active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

const fullEstimate: AmcResourceEstimate = {
  estimates: [
    { category: 'fde_client_engagement', monthly_hours: 4, status: 'assumed', rationale: 'baseline account mgmt' },
    { category: 'technical', monthly_hours: 6, status: 'assumed', rationale: 'monitoring + updates' },
    { category: 'sme', monthly_hours: 3, status: 'assumed', rationale: 'domain oversight' },
    { category: 'ai_optimisation', monthly_hours: 5, status: 'assumed', rationale: 'prompt/data study' },
  ],
  overall_confidence_note: 'Reasonable baseline given a standard single-workflow mechanism.',
};

const benchmarks: AmcRateBenchmark[] = [
  rate({ id: 'a', resource_category: 'fde_client_engagement', rate_per_hour_inr: 1200 }),
  rate({ id: 'b', resource_category: 'technical', rate_per_hour_inr: 2000 }),
  rate({ id: 'c', resource_category: 'sme', rate_per_hour_inr: 2500 }),
  rate({ id: 'd', resource_category: 'ai_optimisation', rate_per_hour_inr: 2200 }),
];

describe('calculateAmcPricing', () => {
  it('never returns below the ₹50,000/month minimum floor, even for a tiny estimate', () => {
    const tinyEstimate: AmcResourceEstimate = {
      estimates: [
        { category: 'fde_client_engagement', monthly_hours: 1, status: 'assumed', rationale: 'minimal' },
        { category: 'technical', monthly_hours: 1, status: 'assumed', rationale: 'minimal' },
        { category: 'sme', monthly_hours: 0, status: 'assumed', rationale: 'not needed' },
        { category: 'ai_optimisation', monthly_hours: 0, status: 'assumed', rationale: 'not needed' },
      ],
      overall_confidence_note: 'Very light-touch solution.',
    };
    const result = calculateAmcPricing({ domain: 'general' }, tinyEstimate, benchmarks);
    expect(result.recommended_range_low_inr).toBeGreaterThanOrEqual(AMC_MONTHLY_MINIMUM_INR);
    expect(result.recommended_range_high_inr).toBeGreaterThanOrEqual(AMC_MONTHLY_MINIMUM_INR);
    expect(result.used_minimum_floor).toBe(true);
  });

  it('prices above the floor for a realistic multi-category estimate, using benchmarked rates', () => {
    const result = calculateAmcPricing({ domain: 'general' }, fullEstimate, benchmarks);
    // 4*1200 + 6*2000 + 3*2500 + 5*2200 = 4800+12000+7500+11000 = 35300 midpoint-ish before the 0.85/1.15 spread
    expect(result.market_equivalent_value_low_inr).toBeGreaterThan(25000);
    expect(result.market_equivalent_value_high_inr).toBeGreaterThan(result.market_equivalent_value_low_inr);
    expect(result.unverified_rate_categories).toHaveLength(0);
  });

  it('flags a resource category as unverified when its benchmark rate is not yet verified', () => {
    const partiallyUnverified = benchmarks.map((b) => (b.resource_category === 'sme' ? { ...b, verified: false } : b));
    const result = calculateAmcPricing({ domain: 'general' }, fullEstimate, partiallyUnverified);
    expect(result.unverified_rate_categories).toContain('sme');
  });

  it('does not fabricate a rate when no benchmark exists for a category — falls back to a cost-based floor and flags it', () => {
    const missingSme = benchmarks.filter((b) => b.resource_category !== 'sme');
    const result = calculateAmcPricing({ domain: 'general' }, fullEstimate, missingSme);
    expect(result.unverified_rate_categories).toContain('sme');
    // still produces a number, never a gap/zero for that category
    expect(result.market_equivalent_value_low_inr).toBeGreaterThan(0);
  });

  it('the internal cost-to-serve figure is always lower than the recommended range for a realistic estimate (there is real margin)', () => {
    const result = calculateAmcPricing({ domain: 'general' }, fullEstimate, benchmarks);
    expect(result.cost_to_serve_inr).toBeLessThan(result.recommended_range_low_inr);
  });

  it('falls back to a domain-specific rate over "general" when both exist', () => {
    const withEcommerce = [...benchmarks, rate({ id: 'e', resource_category: 'technical', domain: 'e-commerce', rate_per_hour_inr: 5000 })];
    const generalResult = calculateAmcPricing({ domain: 'general' }, fullEstimate, withEcommerce);
    const ecommerceResult = calculateAmcPricing({ domain: 'e-commerce' }, fullEstimate, withEcommerce);
    expect(ecommerceResult.market_equivalent_value_low_inr).toBeGreaterThan(generalResult.market_equivalent_value_low_inr);
  });
});
