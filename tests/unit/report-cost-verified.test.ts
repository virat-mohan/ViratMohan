import { describe, it, expect } from 'vitest';
import { reportRows, type BrandReport } from '../../src/lib/retail-os-reports';
import type { Metrics } from '../../src/lib/retail-os-portfolio';

// A profit built on the ₹250 placeholder cost must never appear in a brand report.
const m = (costVerified: boolean): Metrics => ({
  orders: 2, units: 2, grossSales: 3000, discounts: 0, refunds: 0, netSales: 3000, aov: 1500, cogs: 500,
  grossProfit: 2500, adSpend: 0, whatsappCost: 0, barterValue: 0, otherExpenses: 0, netProfit: 2500,
  costVerified, codOrders: 0, barterOrders: 0, metaPurchases: 0, metaRevenue: 0,
});
const report = (cur: boolean, prev: boolean) => ({ brand: { key: 'b', name: 'B' }, current: m(cur), previous: m(prev), budget: null, levers: [] }) as unknown as BrandReport;
const profitRows = (r: BrandReport) => reportRows(r).filter((x) => /profit/i.test(x.label));

describe('brand report profit and purchase cost', () => {
  it('shows profit when the store has a real purchase cost', () => {
    expect(profitRows(report(true, true)).map((r) => r.cur)).toEqual(['₹2,500', '₹2,500']);
  });
  it('shows profit as unavailable when either period uses the placeholder cost', () => {
    for (const r of [report(false, false), report(true, false)]) {
      const rows = profitRows(r);
      expect(rows.map((x) => x.cur)).toEqual(['Unavailable', 'Unavailable']);
      expect(JSON.stringify(rows)).not.toContain('2,500');
    }
  });
});
