import { describe, it, expect, vi } from 'vitest';
import { aggregateOrders, assertNoPii, findPii, scrubMetrics, type OrderLite, type Snapshot } from '../../src/lib/lead-metrics';
import { computeAudit, findGaps, revenueTrend, BENCHMARKS, periodDays } from '../../src/lib/lead-audit';
import { signLeadToken, verifyLeadToken, encryptSecret, decryptSecret } from '../../src/lib/lead-token';
import { generatePlan, unsourcedNumbers, fillPlaceholders, fitTerms, numbersIn, planText } from '../../src/lib/lead-plan';
import { metricsFromCsv, parseCsv } from '../../src/lib/lead-csv';
import { pullShopify, pullMeta, safeMetrics, pickPurchase } from '../../src/lib/lead-connectors';
import { isStalled, stageAfterAccess, leadCanSet, accessRequestDraft, publicConfig, type AccessRow } from '../../src/lib/lead-access';
import type { ClaudeClient } from '../../src/lib/brain/claude';

const SECRET = 'x'.repeat(40);
const LEAD = '3f1c2b7a-9d4e-4a51-8f3b-2c6d7e8f9a0b';
const AT = '2026-09-26T06:00:00Z';

// ---- fixtures: sample data, labelled as sample ------------------------------------------------------
function sampleOrders(): OrderLite[] {
  const o: OrderLite[] = [];
  // 4 customers: A orders twice (repeat), B, C, D once. 1 refunded, 1 RTO, 1 cancelled.
  o.push({ createdAt: '2026-07-02T10:00:00Z', total: 1000, customerKey: 'A', channel: 'web', lines: [{ sku: 'TEA-1', title: 'Masala tea', qty: 2, price: 500 }] });
  o.push({ createdAt: '2026-07-20T10:00:00Z', total: 2000, customerKey: 'B', channel: 'web', lines: [{ sku: 'KIT-1', title: 'Gift kit', qty: 1, price: 2000 }] });
  o.push({ createdAt: '2026-08-05T10:00:00Z', total: 1000, customerKey: 'A', channel: 'web', refunded: 1000, lines: [{ sku: 'TEA-1', title: 'Masala tea', qty: 2, price: 500 }] });
  o.push({ createdAt: '2026-08-15T10:00:00Z', total: 3000, customerKey: 'C', channel: 'pos', rto: true, lines: [{ sku: 'KIT-1', title: 'Gift kit', qty: 1, price: 3000 }] });
  o.push({ createdAt: '2026-09-01T10:00:00Z', total: 500, customerKey: 'D', channel: 'web', cancelled: true, lines: [{ sku: 'TEA-1', title: 'Masala tea', qty: 1, price: 500 }] });
  return o;
}
const snap = <S extends Snapshot['source']>(source: S, metrics: Snapshot<S>['metrics'], period = '2026-06-28..2026-09-25'): Snapshot<S> => ({ source, period, metrics, pulled_at: AT });

function fullSnaps(): Snapshot[] {
  return [
    snap('shopify', {
      currency: 'INR', orders: 300, revenue: 900000, refunded: 45000, returned_orders: 45, rto_orders: 36, cancelled_orders: 5,
      customers_with_orders: 250, repeat_customers: 25,
      months: [
        { month: '2026-06', revenue: 20000, orders: 7 }, { month: '2026-07', revenue: 360000, orders: 120 },
        { month: '2026-08', revenue: 300000, orders: 100 }, { month: '2026-09', revenue: 220000, orders: 73 },
      ],
      top_skus: [{ sku: 'KIT-1', title: 'Gift kit', units: 100, revenue: 400000 }],
      channel_revenue: { web: 900000 },
    }),
    snap('meta', { currency: 'INR', spend: 300000, impressions: 1_000_000, clicks: 20000, purchases: 200, purchase_value: 450000 }),
    snap('ga4', { sessions: 30000, users: 24000, transactions: 300, revenue: 900000, channels: { 'Paid Social': 18000, 'Organic Search': 6000, Direct: 6000 } }),
    snap('gsc', { clicks: 3000, impressions: 200000, ctr: 0.015, position: 12.4, top_queries: [{ query: 'masala tea gift', clicks: 100, impressions: 20000, ctr: 0.005, position: 4.2 }] }),
    snap('amazon', { currency: 'INR', orders: 100, revenue: 300000, refunded: 0, returned_orders: 5, rto_orders: 0, cancelled_orders: 0, months: [], top_skus: [], channel_revenue: { amazon: 300000 } }),
  ];
}

// ---- audit maths --------------------------------------------------------------------------------------
describe('aggregateOrders', () => {
  it('computes revenue, AOV inputs, repeat, returns, RTO, cancelled, top SKUs and months', () => {
    const m = aggregateOrders(sampleOrders());
    expect(m.orders).toBe(4);
    expect(m.revenue).toBe(7000);
    expect(m.cancelled_orders).toBe(1);
    expect(m.returned_orders).toBe(1);
    expect(m.rto_orders).toBe(1);
    expect(m.refunded).toBe(1000);
    expect(m.customers_with_orders).toBe(3);
    expect(m.repeat_customers).toBe(1);
    expect(m.top_skus[0]).toEqual({ sku: 'KIT-1', title: 'Gift kit', units: 2, revenue: 5000 });
    expect(m.months.map((x) => x.month)).toEqual(['2026-07', '2026-08']);
    expect(m.channel_revenue).toEqual({ web: 4000, pos: 3000 });
    // No customer keys survive aggregation.
    expect(JSON.stringify(m)).not.toMatch(/"A"|"B"|"C"/);
  });
});

describe('computeAudit', () => {
  const a = computeAudit(fullSnaps());
  it('derives the standard figures with a source on each', () => {
    expect(a.figures.aov.value).toBe(3000);
    expect(a.figures.repeat_rate.value).toBe(0.1);
    expect(a.figures.return_rate.value).toBe(0.15);
    expect(a.figures.rto_rate.value).toBe(0.12);
    expect(a.figures.roas.value).toBe(1.5);
    expect(a.figures.cac.value).toBe(1500);
    expect(a.figures.blended_roas.value).toBe(3);
    expect(a.figures.conversion_rate.value).toBe(0.01);
    expect(a.figures.sessions.value).toBe(30000);
    expect(periodDays('2026-06-28..2026-09-25')).toBe(90);
    expect(a.figures.monthly_revenue.value).toBe(300000);
    for (const f of Object.values(a.figures)) expect(f.source).toMatch(/^(shopify|meta|ga4|gsc|amazon|flipkart) /);
  });
  it('uses full months for the revenue trend', () => {
    expect(a.figures.revenue_trend.value).toBeCloseTo(-1 / 6, 4); // Jul 3.6L -> Aug 3.0L (Jun and Sep are partial)
    expect(revenueTrend([{ month: '2026-07', revenue: 100, orders: 1 }])).toBeNull();
  });
  it('builds the channel mix across D2C and marketplaces', () => {
    expect(a.channelMix.map((c) => [c.channel, c.share])).toEqual([['Own website', 0.75], ['Amazon', 0.25]]);
  });
  it('lists top queries and missing sources', () => {
    expect(a.topQueries[0].query).toBe('masala tea gift');
    expect(computeAudit([fullSnaps()[0]]).missing).toEqual(['meta', 'ga4', 'gsc']);
  });
  it('uses the newest snapshot per source', () => {
    const older = { ...fullSnaps()[1], pulled_at: '2026-01-01T00:00:00Z', metrics: { ...(fullSnaps()[1].metrics as object), spend: 1 } } as Snapshot;
    expect(computeAudit([older, ...fullSnaps()]).figures.ad_spend.value).toBe(300000);
  });
});

// ---- gap ranking --------------------------------------------------------------------------------------
describe('gap ranking', () => {
  const a = computeAudit(fullSnaps());
  it('sizes each gap in rupees per month by its formula', () => {
    const by = Object.fromEntries(a.allGaps.map((g) => [g.key, g.monthlyImpactInr]));
    // repeat: (0.25-0.10) * 250 * 3000 / 3 months
    expect(by.repeat).toBe(37500);
    // conversion: (0.015-0.01) * 30000 * 3000 / 3
    expect(by.conversion).toBe(150000);
    // roas: (300000 - 450000/3) / 3
    expect(by.roas).toBe(50000);
    // returns: (0.15-0.08) * 300 * 3000 / 3
    expect(by.returns).toBe(21000);
    // rto: (0.12-0.10) * 300 * 3000 / 3
    expect(by.rto).toBe(6000);
    // decline: Jul 3.6L -> Aug 3.0L
    expect(by.decline).toBe(60000);
    // search: (0.03-0.005) * 20000 clicks * 0.01 cr * 3000 / 3
    expect(by.search).toBe(5000);
  });
  it('returns the top 3 biggest first', () => {
    expect(a.gaps.map((g) => g.key)).toEqual(['conversion', 'decline', 'roas']);
    const impacts = a.allGaps.map((g) => g.monthlyImpactInr);
    expect([...impacts].sort((x, y) => y - x)).toEqual(impacts);
  });
  it('ignores metrics already at or better than benchmark', () => {
    const f = { repeat_rate: { key: 'repeat_rate', label: '', value: BENCHMARKS.repeatRate + 0.1, unit: 'pct' as const, source: 's' }, customers: { key: 'customers', label: '', value: 100, unit: 'count' as const, source: 's' } };
    expect(findGaps(f, { periodMonths: 3, aov: 1000, orders: 100, cr: null })).toEqual([]);
  });
});

// ---- token security -----------------------------------------------------------------------------------
describe('lead tokens', () => {
  const t = signLeadToken(LEAD, 'access', SECRET);
  it('round-trips', () => expect(verifyLeadToken(t, 'access', SECRET)).toBe(LEAD));
  it('is purpose-bound', () => expect(verifyLeadToken(t, 'plan', SECRET)).toBeNull());
  it('rejects a different secret', () => expect(verifyLeadToken(t, 'access', 'y'.repeat(40))).toBeNull());
  it('rejects tampering with the id or signature', () => {
    const [id, sig] = t.split('.');
    const other = Buffer.from('3f1c2b7a-9d4e-4a51-8f3b-2c6d7e8f9a0c').toString('base64url');
    expect(verifyLeadToken(`${other}.${sig}`, 'access', SECRET)).toBeNull();
    const flipped = sig.slice(0, -2) + (sig.at(-2) === 'A' ? 'B' : 'A') + sig.at(-1);
    expect(verifyLeadToken(`${id}.${flipped}`, 'access', SECRET)).toBeNull();
    expect(verifyLeadToken(`${id}.`, 'access', SECRET)).toBeNull();
    expect(verifyLeadToken(`${id}.${sig}.x`, 'access', SECRET)).toBeNull();
  });
  it('rejects garbage, empty and oversize input', () => {
    for (const bad of ['', 'abc', '..', LEAD, 'a'.repeat(500), null, undefined]) expect(verifyLeadToken(bad as string, 'access', SECRET)).toBeNull();
  });
  it('refuses to sign or verify with a missing or short secret', () => {
    expect(() => signLeadToken(LEAD, 'access', '')).toThrow();
    expect(() => signLeadToken(LEAD, 'access', 'short')).toThrow();
    expect(verifyLeadToken(t, 'access', '')).toBeNull();
  });
  it('does not expose a guessable id alone: signature is 256-bit', () => {
    expect(Buffer.from(t.split('.')[1], 'base64url').length).toBe(32);
  });
  it('encrypts pasted secrets with authentication', () => {
    const blob = encryptSecret('shpat_abc123', SECRET);
    expect(blob).not.toContain('shpat');
    expect(decryptSecret(blob, SECRET)).toBe('shpat_abc123');
    const parts = blob.split('.');
    parts[3] = Buffer.from('shpat_evil99').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), SECRET)).toThrow();
    expect(() => decryptSecret(blob, 'z'.repeat(40))).toThrow();
  });
});

// ---- no PII -------------------------------------------------------------------------------------------
describe('no-PII guarantee', () => {
  it('scrubs PII keys and PII-looking values', () => {
    const dirty = { revenue: 10, email: 'a@b.com', customer_id: '123', phone: '9876543210', top: [{ query: 'jane@doe.com' }, { query: 'call +91 98765 43210' }, { query: 'masala tea' }], nested: { address: 'x', ok: 'fine' } };
    const clean = scrubMetrics(dirty);
    expect(clean).toEqual({ revenue: 10, top: [{}, {}, { query: 'masala tea' }], nested: { ok: 'fine' } });
    expect(findPii(clean)).toEqual([]);
    expect(() => assertNoPii(dirty)).toThrow(/PII refused/);
  });
  it('the Shopify connector never asks for or keeps customer details', async () => {
    const bodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(JSON.stringify({ data: {
        productsCount: { count: 12 }, customersCount: { count: 400 },
        orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
          { createdAt: '2026-08-01T00:00:00Z', cancelledAt: null, sourceName: 'web', tags: [], displayFinancialStatus: 'PAID', currencyCode: 'INR', totalPriceSet: { shopMoney: { amount: '1500' } }, totalRefundedSet: null, customer: { id: 'gid://shopify/Customer/1', email: 'leak@x.com' }, email: 'leak@x.com', phone: '+919876543210', lineItems: { nodes: [{ sku: 'S1', title: 'Tea', quantity: 1, originalUnitPriceSet: { shopMoney: { amount: '1500' } } }] } },
        ] },
      } }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await pullShopify('brand', 'tok', { fetchImpl, now: new Date(AT) });
    expect(bodies[0]).not.toMatch(/email|phone|firstName|lastName|address/);
    const stored = safeMetrics('shopify', res.metrics);
    expect(JSON.stringify(stored)).not.toMatch(/leak|9876543210|gid:\/\/shopify\/Customer/);
    expect(stored.products_count).toBe(12);
    expect(stored.customers_count).toBe(400);
    expect(stored.customers_with_orders).toBe(1);
  });
  it('CSV uploads keep totals only, even when the file has emails and phones', () => {
    const csv = 'Name,Email,Phone,Created at,Total,Lineitem quantity,Lineitem name,Lineitem sku,Lineitem price,Financial Status\n#1001,a@b.com,9876543210,2026-08-01,1200,2,Tea,T1,600,paid\n#1002,c@d.com,9876543211,2026-08-02,800,1,Kit,K1,800,refunded\n#1003,a@b.com,9876543210,2026-09-01,600,1,Tea,T1,600,paid';
    const { metrics, period } = metricsFromCsv('shopify', csv);
    expect(period).toBe('2026-08-01..2026-09-01');
    expect(metrics.orders).toBe(3);
    expect(metrics.revenue).toBe(2600);
    expect(metrics.repeat_customers).toBe(1);
    expect(metrics.returned_orders).toBe(1);
    expect(findPii(metrics)).toEqual([]);
    expect(JSON.stringify(metrics)).not.toMatch(/@|98765/);
  });
  it('parses quoted CSV fields and GA4 comment lines', () => {
    expect(parseCsv('# GA4\na,b\n"x, y","z ""q"""\n')).toEqual([['a', 'b'], ['x, y', 'z "q"']]);
  });
  it('reads Meta, GA4 and Search Console exports', () => {
    expect(metricsFromCsv('meta', 'Campaign name,Amount spent (INR),Impressions,Link clicks,Purchases,Purchases conversion value\nA,"1,000",100,10,2,3000\nB,500,50,5,1,1000').metrics).toMatchObject({ spend: 1500, purchases: 3, purchase_value: 4000 });
    expect(metricsFromCsv('ga4', '# x\nSession default channel group,Sessions,Total users,Transactions,Purchase revenue\nDirect,100,80,2,2000\nOrganic Search,50,40,1,1000').metrics).toMatchObject({ sessions: 150, transactions: 3, channels: { Direct: 100 } });
    expect(metricsFromCsv('gsc', 'Top queries,Clicks,Impressions,CTR,Position\ntea,10,1000,1%,3\nkit,0,500,0%,9').metrics).toMatchObject({ clicks: 10, impressions: 1500 });
  });
  it('Meta purchases are not double counted', () => {
    expect(pickPurchase([{ action_type: 'purchase', value: '5' }, { action_type: 'omni_purchase', value: '6' }])).toBe(6);
  });
  it('Meta connector reads account-level totals only', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('level=account');
      return new Response(JSON.stringify({ data: [{ spend: '1000', impressions: '10', clicks: '2', actions: [{ action_type: 'purchase', value: '2' }], action_values: [{ action_type: 'purchase', value: '3000' }] }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await pullMeta('act_1234567', { META_ACCESS_TOKEN: 't' }, { fetchImpl, now: new Date(AT) });
    expect(r.metrics).toMatchObject({ spend: 1000, purchases: 2, purchase_value: 3000 });
  });
  it('the page only ever sees non-secret config', () => {
    expect(publicConfig({ shop: 'a.myshopify.com', token: 'shpat', secret_enc: 'x' })).toEqual({ shop: 'a.myshopify.com' });
  });
});

// ---- plan: numbers match snapshots ---------------------------------------------------------------------
describe('plan generator', () => {
  const audit = computeAudit(fullSnaps());
  const now = new Date(AT);

  it('template plan: every number traces to the snapshots, benchmarks or standard terms', async () => {
    const plan = await generatePlan({ brand: 'Sample Tea Co', contactName: 'Asha Rao', audit, now });
    expect(plan.writtenBy).toBe('template');
    expect(unsourcedNumbers(audit, plan)).toEqual([]);
    expect(plan.gaps).toHaveLength(3);
    expect(plan.gaps[0].impact).toBe('₹1,50,000 a month');
    expect(plan.standing.find((s) => s.label === 'Average order value')?.value).toBe('₹3,000');
    expect(plan.goal.statement).toBe('Lift conversion rate from 1.0% to 1.3% by 25 December 2026, worth about ₹75,000 a month.');
    expect(plan.approval.verdict).toBe('ask Virat');
  });

  it('uses Claude prose only through placeholders', async () => {
    const claude: ClaudeClient = { complete: vi.fn(async () => ({ model: 'claude-opus-5-5', text: JSON.stringify({ intro: 'Asha, your average order is {{aov}}. I went through it all.', gap_why: ['Worth {{gap_conversion_impact}} a month.', 'Revenue moved {{revenue_trend}}.', 'ROAS is {{roas}}.'], closing: "Let's talk." }) })) };
    const plan = await generatePlan({ brand: 'Sample Tea Co', contactName: 'Asha', audit, now, claude });
    expect(plan.writtenBy).toBe('claude');
    expect(plan.intro).toContain('₹3,000');
    expect(unsourcedNumbers(audit, plan)).toEqual([]);
  });

  it('rejects a Claude draft that invents a number, and falls back to the template', async () => {
    const claude: ClaudeClient = { complete: vi.fn(async () => ({ model: 'm', text: JSON.stringify({ intro: 'You could make ₹50 lakh more.', gap_why: ['a', 'b', 'c'], closing: "Let's talk." }) })) };
    const plan = await generatePlan({ brand: 'Sample Tea Co', audit, now, claude });
    expect(plan.writtenBy).toBe('template');
    expect(planText(plan)).not.toContain('50 lakh');
    expect(unsourcedNumbers(audit, plan)).toEqual([]);
  });

  it('rejects unknown placeholders and bad JSON', async () => {
    expect(fillPlaceholders('{{made_up}}', { aov: '₹1' })).toBeNull();
    expect(fillPlaceholders('ROAS {{roas}} in 90 days, live in 7 days', { roas: '1.5x' })).toBe('ROAS 1.5x in 90 days, live in 7 days');
    const claude: ClaudeClient = { complete: vi.fn(async () => ({ model: 'm', text: 'not json' })) };
    expect((await generatePlan({ brand: 'B', audit, now, claude })).writtenBy).toBe('template');
  });

  it('flags a number that does not come from the data', async () => {
    const plan = await generatePlan({ brand: 'B', audit, now });
    plan.intro += ' Revenue is ₹9,99,999.';
    expect(unsourcedNumbers(audit, plan)).toEqual(['₹9,99,999']);
  });

  it('offers only the standard terms', () => {
    const { terms, recommended } = fitTerms(audit);
    expect(terms.map((t) => t.value)).toEqual(['40% of the profit pool', '15–20% of revenue', 'from ₹2.5L a month']);
    expect(recommended).toBe('Profit share'); // revenue is sliding
    expect(numbersIn('₹2.5L 15–20% 40%')).toEqual(['₹2.5L', '15–20%', '40%']);
  });

  it('works with only one source connected', async () => {
    const a1 = computeAudit([fullSnaps()[0]]);
    const plan = await generatePlan({ brand: 'B', audit: a1, now });
    expect(plan.missing).toEqual(['Meta ads', 'Google Analytics', 'Search Console']);
    expect(unsourcedNumbers(a1, plan)).toEqual([]);
  });
});

// ---- stages and reminders ------------------------------------------------------------------------------
describe('stages and stalled access', () => {
  const rows = (s: AccessRow['status'], at?: string): AccessRow[] => [{ source: 'shopify', status: s, config: {}, granted_at: s === 'granted' ? at : null, verified_at: s === 'verified' ? at : null }];
  const lead = { id: LEAD, stage: 'access_requested', access_requested_at: '2026-09-20T06:00:00Z', access_reminded_at: null };

  it('moves to data_connected on the first verified source, never backwards', () => {
    expect(stageAfterAccess('access_requested', rows('verified'))).toBe('data_connected');
    expect(stageAfterAccess('access_requested', rows('granted'))).toBe('access_requested');
    expect(stageAfterAccess('plan_ready', rows('verified'))).toBe('plan_ready');
  });
  it('lets the lead mark granted but never verified', () => {
    expect(leadCanSet('not_started', 'granted')).toBe(true);
    expect(leadCanSet('granted', 'verified')).toBe(false);
    expect(leadCanSet('verified', 'not_started')).toBe(false);
  });
  it('flags a stall after 48h with no progress, once per 48h', () => {
    const now = new Date('2026-09-23T06:00:00Z');
    expect(isStalled(lead, [], now)).toBe(true);
    expect(isStalled(lead, [], new Date('2026-09-21T06:00:00Z'))).toBe(false);
    expect(isStalled(lead, rows('granted', '2026-09-22T12:00:00Z'), now)).toBe(false);
    expect(isStalled(lead, rows('verified', '2026-09-21T00:00:00Z'), now)).toBe(false);
    expect(isStalled({ ...lead, access_reminded_at: '2026-09-22T06:00:00Z' }, [], now)).toBe(false);
    expect(isStalled({ ...lead, stage: 'data_connected' }, [], now)).toBe(false);
  });
  it('drafts inside quiet hours (9am-8pm IST, Mon-Sat) and says why', () => {
    const d = accessRequestDraft({ brand_name: 'Sample Tea Co', contact_name: 'Asha Rao' }, 'https://x/y', new Date('2026-09-26T20:00:00Z'), '919999999999');
    const ist = new Date(new Date(d.sendAfter).getTime() + 5.5 * 3_600_000);
    expect(ist.getUTCHours()).toBeGreaterThanOrEqual(9);
    expect(ist.getUTCHours()).toBeLessThan(20);
    expect(ist.getUTCDay()).not.toBe(0);
    expect(d.body).toMatch(/Why:/);
    expect(d.body).toMatch(/Let's talk/);
    expect(d.body.startsWith('Hi Asha,')).toBe(true);
  });
});
