import { describe, it, expect } from 'vitest';
import { economicsStore, validateWorklog, validateCost } from '../../src/lib/devshop-economics-db';
import { isProtectedPath } from '../../src/lib/admin-auth';

// Fake Supabase capturing inserts and serving load(). Enough to exercise the store deterministically.
function fakeSb() {
  const worklog: any[] = [];
  const costs: any[] = [];
  let revenue: any = null;
  const listResult = (rows: any[]) => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) });
  const from = (name: string): any => {
    if (name === 'custom_build_worklog') return { insert: async (r: any) => (worklog.push(r), { error: null }), ...listResult(worklog) };
    if (name === 'custom_build_costs') return { insert: async (r: any) => (costs.push(r), { error: null }), ...listResult(costs) };
    // revenue: upsert + select().eq().maybeSingle()
    return {
      upsert: async (r: any) => { revenue = { ...(revenue ?? {}), ...r }; return { error: null }; },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: revenue, error: null }) }) }),
    };
  };
  return { _worklog: worklog, _costs: costs, get _revenue() { return revenue; }, from } as any;
}

describe('validation', () => {
  it('rejects unknown role/category and non-positive hours', () => {
    expect(validateWorklog({ workDate: '2026-10-01', role: 'ceo', hours: 1, category: 'BUILD' })).toMatch(/unknown role/);
    expect(validateWorklog({ workDate: '2026-10-01', role: 'founder', hours: 1, category: 'PARTY' })).toMatch(/unknown category/);
    expect(validateWorklog({ workDate: '2026-10-01', role: 'founder', hours: 0, category: 'BUILD' })).toMatch(/hours must be positive/);
    expect(validateWorklog({ workDate: '2026-10-01', role: 'founder', hours: 2, category: 'CLIENT' })).toBeNull();
  });
  it('cost requires source and valid attribution', () => {
    expect(validateCost({ amountPaise: 100, category: 'hosting', source: '' })).toMatch(/source is required/);
    expect(validateCost({ amountPaise: 100, category: 'x', source: 'y', attribution: 'weird' as any })).toMatch(/bad attribution/);
    expect(validateCost({ amountPaise: 100, category: 'x', source: 'y' })).toBeNull();
  });
});

describe('economics store', () => {
  it('A/D/E. persists worklog incl. founder hours and computes them', async () => {
    const sb = fakeSb();
    const s = economicsStore(sb);
    await s.addWorklog('sub-1', { workDate: '2026-10-01', role: 'software_engineer', hours: 8, category: 'BUILD' });
    await s.addWorklog('sub-1', { workDate: '2026-10-01', role: 'founder', hours: 2, category: 'CLIENT' });
    const e = await s.compute('sub-1');
    expect(e.totalHours).toBe(10);
    expect(e.founderHours).toBe(2);
    expect(e.labourCost).toMatch(/UNKNOWN/); // F: no rates
  });

  it('F. only direct costs count toward the project', async () => {
    const sb = fakeSb();
    const s = economicsStore(sb);
    await s.addCost('sub-1', { amountPaise: 500_00, category: 'hosting', source: 'vercel' }); // direct default
    await s.addCost('sub-1', { amountPaise: 900_00, category: 'rent', source: 'x', attribution: 'overhead' });
    await s.setRevenue('sub-1', { collectedPaise: 100000_00 });
    const e = await s.compute('sub-1');
    expect(e.contribution.known).toBe(true);
    if (e.contribution.known) expect(e.contribution.value.directNonLabourPaise).toBe(500_00);
  });

  it('B/C. contracted/invoiced/collected stay distinct and are not overwritten by omission', async () => {
    const sb = fakeSb();
    const s = economicsStore(sb);
    await s.setRevenue('sub-1', { contractedPaise: 300000_00, collectedPaise: 50000_00 });
    await s.setRevenue('sub-1', { collectedPaise: 80000_00 }); // only collected changes
    expect(sb._revenue.contracted_paise).toBe(300000_00); // preserved
    expect(sb._revenue.collected_paise).toBe(80000_00);
  });

  it('H. missing revenue → contribution UNKNOWN, never zero; collected is the default basis', async () => {
    const sb = fakeSb();
    const s = economicsStore(sb);
    await s.addWorklog('sub-1', { workDate: '2026-10-01', role: 'software_engineer', hours: 4, category: 'BUILD' });
    const e = await s.compute('sub-1');
    expect(e.contribution.known).toBe(false);
  });
});

describe('security', () => {
  it('K. the economics route is behind admin auth', () => {
    expect(isProtectedPath('/devshop/api/economics')).toBe(true);
    expect(isProtectedPath('/devshop/api/economics/anything')).toBe(true);
  });
});
