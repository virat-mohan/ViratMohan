import { describe, it, expect } from 'vitest';
import { detectCaseStudy, publicView } from '../../src/lib/case-studies';

describe('case study detection', () => {
  it('finds a real lift and writes it in percentages only', () => {
    const c = detectCaseStudy({ orders: 8, netSales: 11438, days: 13 }, { orders: 2, netSales: 4197, days: 3 })!;
    expect(c.lift_pct).toBe(59);
    expect(c.headline).toBe('+59% sales per day in the last 3 days');
    expect(c.headline + c.detail + c.base_note).not.toMatch(/₹|\d{4}/);
    expect(c.base_note).toMatch(/Small base/);
  });
  it('stays quiet on a thin base or a modest lift', () => {
    expect(detectCaseStudy({ orders: 3, netSales: 3000, days: 14 }, { orders: 2, netSales: 2000, days: 3 })).toBeNull();
    expect(detectCaseStudy({ orders: 20, netSales: 14000, days: 14 }, { orders: 4, netSales: 3300, days: 3 })).toBeNull();
    expect(detectCaseStudy({ orders: 20, netSales: 14000, days: 14 }, { orders: 1, netSales: 9000, days: 3 })).toBeNull();
  });
  it('never exposes the brand publicly', () => {
    const v = publicView({ id: 'x', brand_key: 'caps', brand_name: 'Secret Caps', metric: 'sales_per_day', lift_pct: 40, before_start: '', before_end: '', after_start: '', after_end: '', before_orders: 9, after_orders: 3, headline: 'h', detail: 'd', base_note: 'n', status: 'published', created_at: '', published_at: null });
    expect(JSON.stringify(v)).not.toMatch(/Secret|caps/);
  });
});
