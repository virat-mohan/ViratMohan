import { describe, it, expect } from 'vitest';
import { decidePayouts, hashEntries, payoutIdempotencyKey, previousWeekIST, settleWeek, type BrandTerms, type LedgerEntry } from '../../src/lib/settlement';

const now = new Date('2026-09-28T06:30:00Z'); // Monday 12:00 IST
const week = previousWeekIST(now);
const terms = (t: Partial<BrandTerms> = {}): BrandTerms => ({
  brandKey: 'moonglasses', model: 'profit_share', ratePct: 40, retainerPaise: null, retainerDeductedFromSettlement: false,
  reimburseProductCost: false, matchTolerancePaise: 100, codGraceDays: 10, gatewayGraceDays: 3,
  payoutFundAccountId: 'fa_test', payoutAccountChangedAt: '2026-01-01T00:00:00Z', ...t,
});
let n = 0;
const e = (kind: LedgerEntry['kind'], amountPaise: number, x: Partial<LedgerEntry> = {}): LedgerEntry =>
  ({ id: `e${++n}`, kind, amountPaise, occurredAt: '2026-09-16T06:00:00Z', source: 'test', sourceId: `s${n}`, reviewStatus: 'posted', ...x });
const prepaid = (id: string, amt: number) => [e('order_revenue', amt, { orderId: id }), e('gateway_settlement', amt, { orderId: id, occurredAt: '2026-09-18T06:00:00Z' })];
const run = (entries: LedgerEntry[], t: Partial<BrandTerms> = {}, carryInPaise = 0) => settleWeek({ terms: terms(t), entries, ...week, carryInPaise, now });

describe('week window', () => {
  it('settles the Monday–Sunday IST week before this Monday', () => {
    expect(week).toEqual({ weekStart: '2026-09-21', weekEnd: '2026-09-27' });
  });
});

describe('pricing models', () => {
  const base = () => [...prepaid('o1', 100000), e('shipping', 10000), e('ad_spend', 20000)];
  it('profit share: 40% of the profit pool', () => {
    const r = run(base());
    expect(r.profitPoolPaise).toBe(70000);
    expect(r.platformSharePaise).toBe(28000);
    expect(r.payoutPaise).toBe(42000);
    expect(r.status).toBe('reconciled');
  });
  it('revenue share: rate of net revenue', () => {
    const r = run(base(), { model: 'revenue_share', ratePct: 15 });
    expect(r.platformSharePaise).toBe(15000);
    expect(r.payoutPaise).toBe(55000);
  });
  it('retainer: nothing deducted unless configured, then once in the week holding the 1st', () => {
    expect(run(base(), { model: 'retainer', ratePct: null, retainerPaise: 25_000_000 }).platformSharePaise).toBe(0);
    const oct = settleWeek({ terms: terms({ model: 'retainer', ratePct: null, retainerPaise: 25_000_000, retainerDeductedFromSettlement: true }), entries: [], weekStart: '2026-09-28', weekEnd: '2026-10-04', now: new Date('2026-10-05T06:30:00Z') });
    expect(oct.platformSharePaise).toBe(25_000_000);
  });
  it('profit share is never taken from a loss', () => {
    const r = run([...prepaid('o1', 10000), e('ad_spend', 50000)]);
    expect(r.platformSharePaise).toBe(0);
  });
});

describe('refunds, RTO, partial COD', () => {
  it('refund reduces revenue', () => {
    const r = run([...prepaid('o1', 100000), e('refund', 20000, { orderId: 'o1' })]);
    expect(r.netRevenuePaise).toBe(80000);
  });
  it('partial COD matches gateway + courier remittance', () => {
    const r = run([
      e('order_revenue', 100000, { orderId: 'o2', meta: { payment: 'partial_cod', prepaid_paise: 30000 } }),
      e('gateway_settlement', 30000, { orderId: 'o2' }), e('cod_remittance', 70000, { orderId: 'o2' }),
    ]);
    expect(r.mismatches).toEqual([]);
    expect(r.grossRevenuePaise).toBe(100000);
  });
  it('short COD remittance beyond tolerance is flagged and held', () => {
    const r = run([e('order_revenue', 100000, { orderId: 'o3', meta: { payment: 'cod' } }), e('cod_remittance', 90000, { orderId: 'o3' })]);
    expect(r.mismatches[0]).toMatchObject({ orderId: 'o3', reason: 'amount_differs', differencePaise: -10000 });
    expect(r.holdReasons).toContain('unmatched_amounts');
  });
  it('difference within tolerance is fine', () => {
    const r = run([e('order_revenue', 100000, { orderId: 'o4', meta: { payment: 'cod' } }), e('cod_remittance', 99950, { orderId: 'o4' })]);
    expect(r.mismatches).toEqual([]);
  });
  it('RTO: no COD expected, revenue reversed', () => {
    const r = run([e('order_revenue', 50000, { orderId: 'o5', meta: { payment: 'cod' } }), e('rto', 50000, { orderId: 'o5' })]);
    expect(r.mismatches).toEqual([]);
    expect(r.netRevenuePaise).toBe(0);
  });
  it('COD not yet due is deferred, not flagged', () => {
    const r = run([e('order_revenue', 50000, { orderId: 'o6', meta: { payment: 'cod' }, occurredAt: '2026-09-26T06:00:00Z' })]);
    expect(r.deferredEntryIds.length).toBe(1);
    expect(r.grossRevenuePaise).toBe(0);
    expect(r.mismatches).toEqual([]);
  });
  it('review-queue and duplicate rows never count', () => {
    const r = run([...prepaid('o1', 100000), e('order_revenue', 5000, { reviewStatus: 'needs_review' }), e('order_revenue', 5000, { reviewStatus: 'duplicate' })]);
    expect(r.grossRevenuePaise).toBe(100000);
    expect(r.reviewEntryIds.length).toBe(1);
  });
});

describe('carry-forward', () => {
  it('a negative week pays nothing, is held, and carries forward', () => {
    const r = run([...prepaid('o1', 10000), e('ad_spend', 30000)]);
    expect(r.payoutPaise).toBe(0);
    expect(r.carryForwardPaise).toBe(-20000);
    expect(r.holdReasons).toContain('negative_balance');
  });
  it('next week absorbs the carried loss before any share', () => {
    const r = run(prepaid('o1', 100000), {}, -20000);
    expect(r.platformSharePaise).toBe(32000); // 40% of (100000 − 20000)
    expect(r.payoutPaise).toBe(48000);
  });
});

describe('hold rules', () => {
  it('payout account changed in the last 72 hours', () => {
    expect(run(prepaid('o1', 100000), { payoutAccountChangedAt: '2026-09-27T00:00:00Z' }).holdReasons).toContain('payout_account_changed');
    expect(run(prepaid('o1', 100000), { payoutAccountChangedAt: '2026-09-24T00:00:00Z' }).holdReasons).toEqual([]);
  });
  it('missing gateway money past grace is a mismatch', () => {
    expect(run([e('order_revenue', 100000, { orderId: 'o7' })]).mismatches[0].reason).toBe('missing');
  });
  it('caps and dry-run', () => {
    const rs = [{ brandKey: 'a', payoutPaise: 1000, holdReasons: [] }, { brandKey: 'b', payoutPaise: 5000, holdReasons: [] }, { brandKey: 'c', payoutPaise: 900, holdReasons: ['negative_balance' as const] }];
    expect(decidePayouts(rs, { enabled: true, perPayoutCapPaise: null, weeklyCapPaise: null }).every((d) => d.action === 'hold')).toBe(true);
    const d = decidePayouts(rs, { enabled: true, perPayoutCapPaise: 4000, weeklyCapPaise: 10000 });
    expect(d.find((x) => x.brandKey === 'a')!.action).toBe('pay');
    expect(d.find((x) => x.brandKey === 'b')!.reasons).toEqual(['over_payout_cap']);
    expect(d.find((x) => x.brandKey === 'c')!.action).toBe('hold');
    expect(decidePayouts(rs, { enabled: false, perPayoutCapPaise: 4000, weeklyCapPaise: 1500 }).find((x) => x.brandKey === 'a')!.action).toBe('would_pay');
    const w = decidePayouts([{ brandKey: 'x', payoutPaise: 800, holdReasons: [] }, { brandKey: 'y', payoutPaise: 900, holdReasons: [] }], { enabled: true, perPayoutCapPaise: 1000, weeklyCapPaise: 1000 });
    expect(w.map((x) => x.action)).toEqual(['pay', 'hold']);
  });
});

describe('idempotency', () => {
  it('hash and payout key are stable', () => {
    const es = prepaid('o1', 100000);
    expect(hashEntries(es)).toBe(hashEntries([...es].reverse()));
    expect(payoutIdempotencyKey('moonglasses', '2026-09-21')).toBe(payoutIdempotencyKey('moonglasses', '2026-09-21'));
    expect(payoutIdempotencyKey('moonglasses', '2026-09-21')).not.toBe(payoutIdempotencyKey('moonglasses', '2026-09-28'));
  });
});
