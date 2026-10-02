import { describe, it, expect } from 'vitest';
import { buildTree, flatten, latestStatus, updatesByMember, parseUpdate, profitCells, plannerPeriods, type OrgMember, type OrgUpdate } from '../../src/lib/org-board';
import { orgWriteAllowed } from '../../src/lib/org-auth';

const m = (id: string, reports_to: string | null, sort = 0, kind: OrgMember['kind'] = 'function'): OrgMember => ({ id, name: id, role: 'r', kind, reports_to, owns: [], may_decide: null, must_escalate: null, brand_key: null, active: true, sort });
const u = (member_id: string, at: string, status: OrgUpdate['status'] = 'on_track'): OrgUpdate => ({ member_id, at, status, summary: at, pending: [], stuck_on: null, help_needed: null, next_step: null, links: [] });

describe('org tree', () => {
  const members = [m('DS-02', 'DS-01'), m('DS-00', null), m('DS-01', 'DS-00'), m('TC-01', 'DS-02', 11), m('MG-01', 'DS-02', 10), m('P-01', 'DS-00', 30), m('X', 'GONE')];
  it('nests by reports_to, sorts children, orphans become roots', () => {
    const roots = buildTree(members, []);
    expect(roots.map((r) => r.id)).toEqual(['DS-00', 'X']);
    expect(roots[0].children.map((c) => c.id)).toEqual(['DS-01', 'P-01']);
    expect(roots[0].children[0].children[0].children.map((c) => c.id)).toEqual(['MG-01', 'TC-01']);
  });
  it('flattens depth-first with depth', () => {
    expect(flatten(buildTree(members, [])).map((x) => `${x.node.id}:${x.depth}`)).toEqual(['DS-00:0', 'DS-01:1', 'DS-02:2', 'MG-01:3', 'TC-01:3', 'P-01:1', 'X:0']);
  });
  it('attaches the latest update and up to 7 of history', () => {
    const ups = Array.from({ length: 9 }, (_, i) => u('TC-01', `2026-10-0${i + 1}T00:00:00Z`));
    const tc = flatten(buildTree(members, ups)).find((x) => x.node.id === 'TC-01')!.node;
    expect(tc.latest?.at).toBe('2026-10-09T00:00:00Z');
    expect(tc.history).toHaveLength(7);
  });
});

describe('latest status pick', () => {
  it('picks the newest row for the member regardless of order', () => {
    const ups = [u('A', '2026-10-01T10:00:00Z', 'blocked'), u('A', '2026-10-02T09:00:00Z', 'done'), u('B', '2026-10-03T00:00:00Z')];
    expect(latestStatus(ups, 'A')?.status).toBe('done');
    expect(latestStatus(ups, 'C')).toBeNull();
    expect(updatesByMember(ups).get('A')?.[0].status).toBe('done');
  });
});

describe('parseUpdate', () => {
  const ids = new Set(['TC-01']);
  it('accepts a good row and drops non-http links', () => {
    const r = parseUpdate({ member_id: 'TC-01', status: 'blocked', summary: ' x ', links: ['https://a.b', 'javascript:1'] }, ids);
    expect(r.ok && r.row.links).toEqual(['https://a.b']);
  });
  it('rejects unknown member, bad status, missing summary', () => {
    expect(parseUpdate({ member_id: 'ZZ', summary: 'x' }, ids).ok).toBe(false);
    expect(parseUpdate({ member_id: 'TC-01', status: 'great', summary: 'x' }, ids).ok).toBe(false);
    expect(parseUpdate({ member_id: 'TC-01' }, ids).ok).toBe(false);
  });
});

describe('profit cells never estimate', () => {
  const base = { orders: 1, units: 1, grossSales: 1000, discounts: 0, refunds: 0, netSales: 1000, aov: 1000, cogs: 300, grossProfit: 700, adSpend: 100, whatsappCost: 10, barterValue: 0, otherExpenses: 50, netProfit: 540, costVerified: true, codOrders: 0, barterOrders: 0, metaPurchases: 0, metaRevenue: 0 };
  it('computes when cost is real', () => {
    const c = profitCells(base, true);
    expect(c.contribution.value).toBe(590); expect(c.ebitda.value).toBe(540);
  });
  it('no data without real cost or expenses', () => {
    expect(profitCells({ ...base, costVerified: false }, true).contribution.value).toBeNull();
    expect(profitCells(base, false).ebitda.value).toBeNull();
    expect(profitCells(null, true).ebitda.value).toBeNull();
  });
});

it('planner periods', () => {
  expect(plannerPeriods('2026-01-15')).toMatchObject({ mtd: { start: '2026-01-01', end: '2026-01-16' }, lastMonth: { start: '2025-12-01', end: '2026-01-01' } });
});

it('org write auth', () => {
  expect(orgWriteAllowed(null, 's', 'p')).toBe(false);
  expect(orgWriteAllowed('Bearer s', 's', 'p')).toBe(true);
  expect(orgWriteAllowed('Bearer ', '', 'p')).toBe(false);
});
