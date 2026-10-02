import { describe, it, expect } from 'vitest';
import { recommendShipping, chargeableWeight } from '../../src/lib/shipping-policy';

describe('shipping policy', () => {
  it('light, high-value products ship free inside the price (caps, sunglasses)', () => {
    expect(recommendShipping([{ name: 'Cap', priceInr: 1399, weightKg: 0.2 }]).model).toBe('free');
    expect(recommendShipping([{ name: 'Sunglasses', priceInr: 1999, weightKg: 0.15 }]).model).toBe('free');
  });
  it('heavy or bulky products charge the live pincode rate (car parts)', () => {
    const r = recommendShipping([{ name: 'Headlight kit', priceInr: 4999, weightKg: 2.5, lengthCm: 30, widthCm: 25, heightCm: 15 }]);
    expect(r.model).toBe('calculated');
  });
  it('mid cases get a free-above threshold', () => {
    const r = recommendShipping([{ name: 'Treats', priceInr: 499, weightKg: 0.5 }]);
    expect(r.model).toBe('threshold');
    expect(r.thresholdInr).toBeGreaterThan(499);
  });
  it('uses volumetric weight when the box is big and light', () => {
    expect(chargeableWeight({ priceInr: 1, weightKg: 0.3, lengthCm: 40, widthCm: 30, heightCm: 20 })).toBe(5);
  });
});
