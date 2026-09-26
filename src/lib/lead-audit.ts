// The audit engine: pure functions from snapshots to sourced figures and the 3 biggest gaps.
// Every figure carries the snapshot it came from. Benchmarks are labelled as benchmarks, never as their numbers.
import type { Ga4Metrics, GscMetrics, MetaMetrics, MonthRow, QueryRow, SalesMetrics, SkuRow, Snapshot, Source } from './lead-metrics';

export type Unit = 'inr' | 'pct' | 'count' | 'x' | 'pos';
export type Figure = { key: string; label: string; value: number; unit: Unit; source: string };
export type Gap = {
  key: string;
  title: string;
  metric: string;                // figure key the gap is measured on
  baseline: number;              // their number
  benchmark: number;             // the benchmark I use
  unit: Unit;
  monthlyImpactInr: number;      // money on the table per month if the gap were closed to benchmark
  basis: string;                 // how the impact was worked out, in words
  uses: string[];                // figure keys used
};
export type ChannelShare = { channel: string; value: number; share: number; unit: 'inr' | 'sessions'; source: string };
export type Audit = {
  figures: Record<string, Figure>;
  months: MonthRow[];
  topSkus: SkuRow[];
  topQueries: QueryRow[];
  channelMix: ChannelShare[];
  gaps: Gap[];                   // top 3 by monthly money impact
  allGaps: Gap[];
  sources: Source[];
  missing: Source[];
  periodMonths: number;
};

/** Benchmarks I use to size gaps. Shown on the plan as benchmarks, not as the lead's numbers. */
export const BENCHMARKS = {
  repeatRate: 0.25,       // share of customers who order twice or more in 90 days
  conversionRate: 0.015,  // orders per session, D2C
  roas: 3,                // Meta-reported purchase value / spend
  returnRate: 0.08,       // orders with a refund or return
  rtoRate: 0.1,           // returned-to-origin orders, COD-heavy India D2C
  searchCtr: 0.03,        // page-one search queries
  declineFloor: -0.1,     // month-on-month revenue change that counts as a decline
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const round100 = (n: number) => Math.max(0, Math.round(n / 100) * 100);
const cite = (s: Snapshot) => `${s.source} ${s.period}${s.via === 'csv' ? ' (csv)' : ''}`;

export function periodDays(period: string): number | null {
  const m = period.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (!m) return null;
  return Math.round((Date.parse(m[2]) - Date.parse(m[1])) / 86_400_000) + 1;
}

/** The newest snapshot per source. */
export function latestBySource(snaps: Snapshot[]): Partial<Record<Source, Snapshot>> {
  const out: Partial<Record<Source, Snapshot>> = {};
  for (const s of snaps) {
    const cur = out[s.source];
    if (!cur || s.pulled_at > cur.pulled_at) out[s.source] = s;
  }
  return out;
}

/** Month-on-month change using full months only (the first and last months of a rolling window are partial). */
export function revenueTrend(months: MonthRow[]): { first: MonthRow; last: MonthRow; change: number } | null {
  const full = months.length >= 4 ? months.slice(1, -1) : months;
  if (full.length < 2) return null;
  const first = full[0], last = full[full.length - 1];
  if (first.revenue <= 0) return null;
  return { first, last, change: r4((last.revenue - first.revenue) / first.revenue) };
}

export function computeAudit(snaps: Snapshot[]): Audit {
  const by = latestBySource(snaps);
  const figures: Record<string, Figure> = {};
  const put = (key: string, label: string, value: number | null | undefined, unit: Unit, s: Snapshot) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    figures[key] = { key, label, value: unit === 'pct' ? r4(value) : r2(value), unit, source: cite(s) };
  };

  const shop = by.shopify as Snapshot<'shopify'> | undefined;
  const meta = by.meta as Snapshot<'meta'> | undefined;
  const ga4 = by.ga4 as Snapshot<'ga4'> | undefined;
  const gsc = by.gsc as Snapshot<'gsc'> | undefined;
  const markets = (['amazon', 'flipkart'] as const).map((k) => by[k] as Snapshot<'amazon'> | undefined).filter(Boolean) as Snapshot<'amazon'>[];

  // The main sales source: the D2C store if connected, else the biggest marketplace.
  const main: Snapshot<'shopify'> | undefined = shop ?? ([...markets] as unknown as Snapshot<'shopify'>[]).sort((a, b) => b.metrics.revenue - a.metrics.revenue)[0];
  const days = main ? periodDays(main.period) : null;
  const periodMonths = days ? days / 30 : main ? Math.max(1, main.metrics.months.length) : 3;

  let aov: number | null = null, orders = 0;
  let trend: ReturnType<typeof revenueTrend> = null;
  if (main) {
    const m: SalesMetrics = main.metrics;
    orders = m.orders;
    aov = m.orders ? m.revenue / m.orders : null;
    put('revenue', 'Revenue', m.revenue, 'inr', main);
    put('monthly_revenue', 'Revenue per month', m.revenue / periodMonths, 'inr', main);
    put('orders', 'Orders', m.orders, 'count', main);
    put('aov', 'Average order value', aov, 'inr', main);
    if (m.customers_with_orders) {
      put('customers', 'Customers who ordered', m.customers_with_orders, 'count', main);
      put('repeat_rate', 'Repeat rate', (m.repeat_customers ?? 0) / m.customers_with_orders, 'pct', main);
    }
    if (m.orders) {
      put('return_rate', 'Return or refund rate', m.returned_orders / m.orders, 'pct', main);
      put('rto_rate', 'RTO rate', m.rto_orders / m.orders, 'pct', main);
    }
    put('refunded', 'Refunded', m.refunded, 'inr', main);
    const t = (trend = revenueTrend(m.months));
    if (t) put('revenue_trend', `Revenue change, ${t.first.month} to ${t.last.month}`, t.change, 'pct', main);
  }

  if (meta) {
    const m: MetaMetrics = meta.metrics;
    put('ad_spend', 'Meta ad spend', m.spend, 'inr', meta);
    if (m.spend > 0) put('roas', 'Meta ROAS (Meta-reported)', m.purchase_value / m.spend, 'x', meta);
    if (m.purchases > 0) put('cac', 'Cost per purchase (Meta-reported CAC)', m.spend / m.purchases, 'inr', meta);
    if (shop && m.spend > 0) put('blended_roas', 'Blended ROAS (store revenue / Meta spend)', shop.metrics.revenue / m.spend, 'x', shop);
  }

  let cr: number | null = null;
  if (ga4) {
    const m: Ga4Metrics = ga4.metrics;
    put('sessions', 'Sessions', m.sessions, 'count', ga4);
    const conv = m.transactions || (shop ? shop.metrics.orders : 0);
    if (m.sessions > 0 && conv > 0) { cr = conv / m.sessions; put('conversion_rate', 'Conversion rate', cr, 'pct', ga4); }
  }
  if (gsc) {
    const m: GscMetrics = gsc.metrics;
    put('search_clicks', 'Search clicks', m.clicks, 'count', gsc);
    put('search_impressions', 'Search impressions', m.impressions, 'count', gsc);
    put('search_ctr', 'Search click-through rate', m.ctr, 'pct', gsc);
  }

  // Channel mix: revenue by sales source, else sessions by GA4 channel.
  const channelMix: ChannelShare[] = [];
  const sales = [shop, ...markets].filter(Boolean) as Snapshot<'shopify'>[];
  const totalSales = sales.reduce((a, s) => a + s.metrics.revenue, 0);
  if (totalSales > 0) {
    for (const s of sales) channelMix.push({ channel: s.source === 'shopify' ? 'Own website' : s.source === 'amazon' ? 'Amazon' : 'Flipkart', value: r2(s.metrics.revenue), share: r4(s.metrics.revenue / totalSales), unit: 'inr', source: cite(s) });
  } else if (ga4 && ga4.metrics.sessions > 0) {
    for (const [k, v] of Object.entries(ga4.metrics.channels)) channelMix.push({ channel: k, value: v, share: r4(v / ga4.metrics.sessions), unit: 'sessions', source: cite(ga4) });
  }
  channelMix.sort((a, b) => b.value - a.value);

  const allGaps = findGaps(figures, { periodMonths, aov, orders, cr, gsc, meta, trend });
  const present = Object.keys(by) as Source[];
  return {
    figures,
    months: main?.metrics.months ?? [],
    topSkus: main?.metrics.top_skus.slice(0, 5) ?? [],
    topQueries: gsc?.metrics.top_queries.slice(0, 5) ?? [],
    channelMix,
    gaps: allGaps.slice(0, 3),
    allGaps,
    sources: present,
    missing: (['shopify', 'meta', 'ga4', 'gsc'] as Source[]).filter((s) => !present.includes(s)),
    periodMonths: r2(periodMonths),
  };
}

type Ctx = { periodMonths: number; aov: number | null; orders: number; cr: number | null; gsc?: Snapshot<'gsc'>; meta?: Snapshot<'meta'>; trend?: ReturnType<typeof revenueTrend> };

/** Every candidate gap, sized in rupees per month, biggest first. Pure. */
export function findGaps(f: Record<string, Figure>, c: Ctx): Gap[] {
  const B = BENCHMARKS;
  const gaps: Gap[] = [];
  const per = (n: number) => round100(n / c.periodMonths);

  if (f.repeat_rate && f.customers && c.aov && f.repeat_rate.value < B.repeatRate) {
    gaps.push({
      key: 'repeat', title: 'Too few customers come back', metric: 'repeat_rate', baseline: f.repeat_rate.value, benchmark: B.repeatRate, unit: 'pct',
      monthlyImpactInr: per((B.repeatRate - f.repeat_rate.value) * f.customers.value * c.aov),
      basis: 'Extra repeat customers at the benchmark rate, times average order value, per month.', uses: ['repeat_rate', 'customers', 'aov'],
    });
  }
  if (f.conversion_rate && f.sessions && c.aov && f.conversion_rate.value < B.conversionRate) {
    gaps.push({
      key: 'conversion', title: 'Visitors are not turning into orders', metric: 'conversion_rate', baseline: f.conversion_rate.value, benchmark: B.conversionRate, unit: 'pct',
      monthlyImpactInr: per((B.conversionRate - f.conversion_rate.value) * f.sessions.value * c.aov),
      basis: 'Extra orders if the same sessions converted at the benchmark rate, times average order value, per month.', uses: ['conversion_rate', 'sessions', 'aov'],
    });
  }
  if (f.roas && f.ad_spend && f.roas.value < B.roas && c.meta) {
    const value = c.meta.metrics.purchase_value;
    gaps.push({
      key: 'roas', title: 'Ad spend is not paying back', metric: 'roas', baseline: f.roas.value, benchmark: B.roas, unit: 'x',
      monthlyImpactInr: per(f.ad_spend.value - value / B.roas),
      basis: 'Spend above what the same purchase value would cost at the benchmark ROAS, per month.', uses: ['roas', 'ad_spend'],
    });
  }
  if (f.return_rate && c.aov && f.return_rate.value > B.returnRate) {
    gaps.push({
      key: 'returns', title: 'Too many orders come back as refunds', metric: 'return_rate', baseline: f.return_rate.value, benchmark: B.returnRate, unit: 'pct',
      monthlyImpactInr: per((f.return_rate.value - B.returnRate) * c.orders * c.aov),
      basis: 'Orders refunded above the benchmark rate, times average order value, per month.', uses: ['return_rate', 'orders', 'aov'],
    });
  }
  if (f.rto_rate && c.aov && f.rto_rate.value > B.rtoRate) {
    gaps.push({
      key: 'rto', title: 'Too many parcels return to origin', metric: 'rto_rate', baseline: f.rto_rate.value, benchmark: B.rtoRate, unit: 'pct',
      monthlyImpactInr: per((f.rto_rate.value - B.rtoRate) * c.orders * c.aov),
      basis: 'RTO orders above the benchmark rate, times average order value, per month.', uses: ['rto_rate', 'orders', 'aov'],
    });
  }
  if (f.revenue_trend && c.trend && f.revenue_trend.value < B.declineFloor) {
    gaps.push({
      key: 'decline', title: 'Revenue is sliding', metric: 'revenue_trend', baseline: f.revenue_trend.value, benchmark: 0, unit: 'pct',
      monthlyImpactInr: round100(c.trend.first.revenue - c.trend.last.revenue),
      basis: `Revenue needed to get ${c.trend.last.month} back to the ${c.trend.first.month} level.`, uses: ['revenue_trend'],
    });
  }
  if (c.gsc && c.cr && c.aov) {
    const extraClicks = c.gsc.metrics.top_queries
      .filter((q) => q.position > 0 && q.position <= 10 && q.ctr < B.searchCtr)
      .reduce((a, q) => a + (B.searchCtr - q.ctr) * q.impressions, 0);
    if (extraClicks > 0) {
      gaps.push({
        key: 'search', title: 'Search shows them but people do not click', metric: 'search_ctr', baseline: f.search_ctr?.value ?? c.gsc.metrics.ctr, benchmark: B.searchCtr, unit: 'pct',
        monthlyImpactInr: per(extraClicks * c.cr * c.aov),
        basis: 'Extra clicks on page-one queries at the benchmark click-through rate, times their conversion rate and average order value, per month.', uses: ['search_ctr', 'conversion_rate', 'aov'],
      });
    }
  }
  return gaps.filter((g) => g.monthlyImpactInr > 0).sort((a, b) => b.monthlyImpactInr - a.monthlyImpactInr);
}
