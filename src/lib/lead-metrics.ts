// What a lead snapshot may hold: aggregates and derived metrics only.
// Connectors and CSV uploads both reduce raw rows to these shapes in memory; raw rows are never stored.

export type Source = 'shopify' | 'meta' | 'ga4' | 'gsc' | 'amazon' | 'flipkart';
export const SOURCES: Source[] = ['shopify', 'meta', 'ga4', 'gsc', 'amazon', 'flipkart'];

export type MonthRow = { month: string; revenue: number; orders: number };
export type SkuRow = { sku: string; title: string; units: number; revenue: number };

/** Shopify and marketplaces share one shape (marketplaces leave customer fields undefined). */
export type SalesMetrics = {
  currency: string;
  orders: number;
  revenue: number;               // gross of refunds, excluding cancelled orders
  refunded: number;              // money refunded
  returned_orders: number;       // orders with any refund or a return status
  rto_orders: number;            // returned to origin (tagged RTO / status RTO)
  cancelled_orders: number;
  customers_with_orders?: number;
  repeat_customers?: number;     // customers with 2+ orders in the period
  months: MonthRow[];
  top_skus: SkuRow[];
  channel_revenue: Record<string, number>;
  products_count?: number;       // Shopify: catalogue size
  customers_count?: number;      // Shopify: total customer records (a count, never the records)
};
export type MetaMetrics = { currency: string; spend: number; impressions: number; clicks: number; purchases: number; purchase_value: number };
export type Ga4Metrics = { sessions: number; users: number; transactions: number; revenue: number; channels: Record<string, number> };
export type QueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number };
export type GscMetrics = { clicks: number; impressions: number; ctr: number; position: number; top_queries: QueryRow[] };

export type MetricsFor = { shopify: SalesMetrics; amazon: SalesMetrics; flipkart: SalesMetrics; meta: MetaMetrics; ga4: Ga4Metrics; gsc: GscMetrics };
export type Snapshot<S extends Source = Source> = { id?: string; source: S; period: string; metrics: MetricsFor[S]; pulled_at: string; via?: 'connector' | 'csv' };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const day = (d: Date) => d.toISOString().slice(0, 10);
export const periodOf = (from: Date, to: Date) => `${day(from)}..${day(to)}`;

// ---------------------------------------------------------------------------------------------------
// Sales aggregation (Shopify orders, Amazon/Flipkart order reports)
// ---------------------------------------------------------------------------------------------------

/** One order, reduced to what the audit needs. `customerKey` is used for counting in memory only. */
export type OrderLite = {
  createdAt: string;
  total: number;
  refunded?: number;
  cancelled?: boolean;
  returned?: boolean;
  rto?: boolean;
  customerKey?: string | null;
  channel?: string | null;
  lines: { sku?: string | null; title?: string | null; qty: number; price: number }[];
};

export function aggregateOrders(orders: OrderLite[], currency = 'INR', topN = 10): SalesMetrics {
  const months = new Map<string, MonthRow>();
  const skus = new Map<string, SkuRow>();
  const perCustomer = new Map<string, number>();
  const channels: Record<string, number> = {};
  let revenue = 0, refunded = 0, returned = 0, rto = 0, cancelled = 0, count = 0;

  for (const o of orders) {
    if (o.cancelled) { cancelled++; continue; }
    count++;
    revenue += o.total;
    refunded += o.refunded ?? 0;
    if (o.returned || (o.refunded ?? 0) > 0) returned++;
    if (o.rto) rto++;
    const m = o.createdAt.slice(0, 7);
    const row = months.get(m) ?? { month: m, revenue: 0, orders: 0 };
    row.revenue += o.total; row.orders++;
    months.set(m, row);
    if (o.customerKey) perCustomer.set(o.customerKey, (perCustomer.get(o.customerKey) ?? 0) + 1);
    const ch = (o.channel || 'other').toLowerCase();
    channels[ch] = (channels[ch] ?? 0) + o.total;
    for (const l of o.lines) {
      const k = (l.sku || l.title || 'unknown').trim();
      const s = skus.get(k) ?? { sku: (l.sku || '').trim(), title: (l.title || '').trim(), units: 0, revenue: 0 };
      s.units += l.qty; s.revenue += l.qty * l.price;
      skus.set(k, s);
    }
  }
  const hasCustomers = perCustomer.size > 0;
  return {
    currency,
    orders: count,
    revenue: r2(revenue),
    refunded: r2(refunded),
    returned_orders: returned,
    rto_orders: rto,
    cancelled_orders: cancelled,
    ...(hasCustomers ? { customers_with_orders: perCustomer.size, repeat_customers: [...perCustomer.values()].filter((n) => n >= 2).length } : {}),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((x) => ({ ...x, revenue: r2(x.revenue) })),
    top_skus: [...skus.values()].sort((a, b) => b.revenue - a.revenue).slice(0, topN).map((x) => ({ ...x, revenue: r2(x.revenue) })),
    channel_revenue: Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, r2(v)])),
  };
}

// ---------------------------------------------------------------------------------------------------
// No-PII guarantee. Every snapshot goes through scrubMetrics() and then assertNoPii() before insert.
// ---------------------------------------------------------------------------------------------------

const PII_KEY = /(e-?mail|phone|mobile|address|first_?name|last_?name|full_?name|^name$|customer_?(id|name|email)|buyer|zip|pin_?code|postal|ip_?addr|^ip$|gstin|pan_?(no|number)?$)/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(\+?\d[\d\s-]{8,}\d)/;
const isPiiString = (s: string) => EMAIL.test(s) || (PHONE.test(s) && s.replace(/\D/g, '').length >= 10);

/** Drops PII keys, and any string value (or array element) that looks like an email or phone number. */
export function scrubMetrics<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== undefined);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        if (PII_KEY.test(k) || isPiiString(k)) continue;
        const w = walk(x);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    if (typeof v === 'string') return isPiiString(v) ? undefined : v;
    return v;
  };
  return walk(value) as T;
}

/** Lists every PII-looking key or value. Empty means safe to store. */
export function findPii(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((x, i) => findPii(x, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, x]) => [
      ...(PII_KEY.test(k) || isPiiString(k) ? [`${path}.${k} (key)`] : []),
      ...findPii(x, `${path}.${k}`),
    ]);
  }
  if (typeof value === 'string' && isPiiString(value)) return [`${path} (value)`];
  return [];
}

export function assertNoPii(value: unknown) {
  const hits = findPii(value);
  if (hits.length) throw new Error(`PII refused in snapshot: ${hits.slice(0, 5).join(', ')}`);
}
