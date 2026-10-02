import { describe, it, expect } from 'vitest';
import { buildNeedsYou, type BrandRow, type DevShopRow } from '../../src/lib/command-centre';

const now = Date.parse('2026-10-02T12:00:00Z');
const row = (o: Partial<BrandRow>): BrandRow & { adminUrl: string | null } => ({ key: 'caps', name: 'Caps', orders: 1, prevOrders: 1, netSales: 1, prevNetSales: 1, adSpend: 0, costPerOrder: 0, checkout: null, unread: 0, oldestUnreadAt: null, paidNotShipped: 0, error: null, adminUrl: 'https://caps.example/admin', ...o });
const dev: DevShopRow = { unread: 0, oldestUnreadAt: null, newLeads7d: 3, postsReady: 0, princeDueSoon: 2, princeOverdue: 0 };

describe('buildNeedsYou', () => {
  it('is empty when nothing comes to Virat', () => {
    expect(buildNeedsYou([row({})], dev, now)).toEqual([]);
  });
  it('flags unread over 4 hours only, and paid-not-shipped', () => {
    const items = buildNeedsYou([
      row({ unread: 2, oldestUnreadAt: '2026-10-02T06:00:00Z', paidNotShipped: 1 }),
      row({ name: 'Fresh', unread: 5, oldestUnreadAt: '2026-10-02T11:00:00Z' }),
    ], dev, now);
    expect(items.map((i) => i.brand)).toEqual(['Caps', 'Caps']);
    expect(items[0].href).toBe('https://caps.example/admin/inbox');
    expect(items[1].href).toBe('https://caps.example/admin/orders');
  });
  it('ignores unknown (null) data and adds DevShop posts and overdue Prince tasks', () => {
    const items = buildNeedsYou([row({ unread: null, paidNotShipped: null })], { ...dev, postsReady: 2, princeOverdue: 1, unread: null }, now);
    expect(items.map((i) => i.kind)).toEqual(['handles', 'people']);
  });
});
