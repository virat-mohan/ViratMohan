// CSV fallback for any source: the lead uploads a report, it is reduced to aggregates in memory,
// and only the aggregates are stored. Column names are matched loosely so the standard exports
// (Shopify orders, Amazon order report, Flipkart orders, Meta Ads Manager, GA4, Search Console) all work.
import { aggregateOrders, periodOf, type Ga4Metrics, type GscMetrics, type MetaMetrics, type OrderLite, type SalesMetrics, type Source, type MetricsFor } from './lead-metrics';

export const MAX_CSV_BYTES = 8 * 1024 * 1024;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const s = text.replace(/^﻿/, '');
  const delim = (s.split('\n')[0].match(/\t/g)?.length ?? 0) > (s.split('\n')[0].match(/,/g)?.length ?? 0) ? '\t' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  // GA4 exports start with '#' comment lines. Only leading ones: Shopify order names ("#1001") also start with '#'.
  let start = 0;
  while (start < rows.length && rows[start][0]?.startsWith('#')) start++;
  return rows.slice(start);
}

const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function table(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The file needs a header row and at least one data row.');
  const header = rows[0].map(norm);
  const col = (...names: string[]) => {
    for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
    for (const n of names) { const i = header.findIndex((h) => h.startsWith(n)); if (i >= 0) return i; }
    return -1;
  };
  return { rows: rows.slice(1), col };
}
export const num = (v: string | undefined) => {
  if (!v) return 0;
  const n = Number(v.replace(/[₹$,%\s]|INR|Rs\.?/gi, ''));
  return Number.isFinite(n) ? n : 0;
};
const isoDate = (v: string | undefined) => {
  if (!v) return null;
  const t = v.trim();
  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  const d = dmy ? new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])) : new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
};

function salesFromCsv(text: string, source: Source): { period: string; metrics: SalesMetrics } {
  const { rows, col } = table(text);
  const c = {
    id: col('name', 'order id', 'amazon order id', 'order item id', 'order number'),
    date: col('created at', 'purchase date', 'order date', 'ordered on', 'date'),
    total: col('total', 'item price', 'invoice amount', 'final invoice amount', 'order total', 'selling price', 'amount'),
    linePrice: col('lineitem price'),
    qty: col('lineitem quantity', 'quantity purchased', 'quantity', 'qty'),
    sku: col('lineitem sku', 'sku', 'seller sku', 'fsn'),
    title: col('lineitem name', 'product name', 'product title', 'product'),
    status: col('financial status', 'order status', 'item status', 'status', 'return status'),
    refunded: col('refunded amount'),
    customer: col('email', 'customer id', 'buyer email'),
    channel: col('source', 'sales channel', 'fulfillment channel'),
  };
  if (c.total < 0 && c.linePrice < 0) throw new Error('Could not find an amount column (Total, item-price or Invoice Amount).');
  const orders = new Map<string, OrderLite>();
  let min: Date | null = null, max: Date | null = null;
  rows.forEach((r, i) => {
    const id = (c.id >= 0 ? r[c.id] : '') || `row${i}`;
    const d = isoDate(r[c.date]);
    if (d) { if (!min || d < min) min = d; if (!max || d > max) max = d; }
    const status = (c.status >= 0 ? r[c.status] : '').toLowerCase();
    const o = orders.get(id) ?? { createdAt: (d ?? new Date(0)).toISOString(), total: 0, refunded: 0, lines: [], customerKey: c.customer >= 0 ? (r[c.customer] || null) : null, channel: c.channel >= 0 ? r[c.channel] || source : source };
    const qty = c.qty >= 0 ? num(r[c.qty]) || 1 : 1;
    const rowTotal = c.total >= 0 ? num(r[c.total]) : 0;
    const linePrice = c.linePrice >= 0 ? num(r[c.linePrice]) : rowTotal / qty;
    o.total += c.total >= 0 ? rowTotal : linePrice * qty;
    o.refunded = (o.refunded ?? 0) + (c.refunded >= 0 ? num(r[c.refunded]) : 0);
    if (/cancel/.test(status)) o.cancelled = true;
    if (/return|refund/.test(status)) o.returned = true;
    if (/\brto\b|return to origin|undeliver/.test(status)) o.rto = true;
    o.lines.push({ sku: c.sku >= 0 ? r[c.sku] : null, title: c.title >= 0 ? r[c.title] : null, qty, price: linePrice });
    orders.set(id, o);
  });
  const metrics = aggregateOrders([...orders.values()]);
  return { period: min && max ? periodOf(min, max) : 'csv', metrics };
}

function metaFromCsv(text: string): { period: string; metrics: MetaMetrics } {
  const { rows, col } = table(text);
  const c = { spend: col('amount spent'), imp: col('impressions'), clicks: col('link clicks', 'clicks all', 'clicks'), pur: col('purchases', 'results'), val: col('purchases conversion value', 'purchase conversion value', 'conversion value'), start: col('reporting starts'), end: col('reporting ends') };
  if (c.spend < 0) throw new Error('Could not find "Amount spent" in this Meta export.');
  const sum = (i: number) => (i < 0 ? 0 : rows.reduce((a, r) => a + num(r[i]), 0));
  const s = isoDate(rows[0]?.[c.start]), e = isoDate(rows[0]?.[c.end]);
  return { period: s && e ? periodOf(s, e) : 'csv', metrics: { currency: 'INR', spend: sum(c.spend), impressions: sum(c.imp), clicks: sum(c.clicks), purchases: sum(c.pur), purchase_value: sum(c.val) } };
}

function ga4FromCsv(text: string): { period: string; metrics: Ga4Metrics } {
  const { rows, col } = table(text);
  const c = { ch: col('session default channel group', 'default channel group', 'first user default channel group'), s: col('sessions'), u: col('total users', 'users', 'active users'), t: col('transactions', 'ecommerce purchases', 'purchases'), rev: col('purchase revenue', 'total revenue') };
  if (c.s < 0) throw new Error('Could not find "Sessions" in this GA4 export.');
  const m: Ga4Metrics = { sessions: 0, users: 0, transactions: 0, revenue: 0, channels: {} };
  for (const r of rows) {
    if (c.ch >= 0 && /^(grand )?total$/i.test(r[c.ch] ?? '')) continue;
    m.sessions += num(r[c.s]); m.users += num(r[c.u]); m.transactions += num(r[c.t]); m.revenue += num(r[c.rev]);
    if (c.ch >= 0) m.channels[r[c.ch] || '(other)'] = (m.channels[r[c.ch] || '(other)'] ?? 0) + num(r[c.s]);
  }
  return { period: 'csv', metrics: m };
}

function gscFromCsv(text: string): { period: string; metrics: GscMetrics } {
  const { rows, col } = table(text);
  const c = { q: col('top queries', 'query', 'queries'), cl: col('clicks'), im: col('impressions'), pos: col('position') };
  if (c.cl < 0 || c.im < 0) throw new Error('Could not find Clicks and Impressions in this Search Console export.');
  const qs = rows.map((r) => ({ query: c.q >= 0 ? r[c.q] : '', clicks: num(r[c.cl]), impressions: num(r[c.im]), position: num(r[c.pos]) }));
  const clicks = qs.reduce((a, x) => a + x.clicks, 0), impressions = qs.reduce((a, x) => a + x.impressions, 0);
  const position = impressions ? qs.reduce((a, x) => a + x.position * x.impressions, 0) / impressions : 0;
  return {
    period: 'csv',
    metrics: {
      clicks, impressions, ctr: impressions ? Math.round((clicks / impressions) * 10000) / 10000 : 0, position: Math.round(position * 10) / 10,
      top_queries: qs.sort((a, b) => b.clicks - a.clicks).slice(0, 25).map((x) => ({ ...x, ctr: x.impressions ? Math.round((x.clicks / x.impressions) * 10000) / 10000 : 0 })),
    },
  };
}

export function metricsFromCsv<S extends Source>(source: S, text: string): { period: string; metrics: MetricsFor[S] } {
  if (text.length > MAX_CSV_BYTES) throw new Error('That file is over 8 MB. Export a shorter date range (90 days is plenty).');
  switch (source) {
    case 'meta': return metaFromCsv(text) as { period: string; metrics: MetricsFor[S] };
    case 'ga4': return ga4FromCsv(text) as { period: string; metrics: MetricsFor[S] };
    case 'gsc': return gscFromCsv(text) as { period: string; metrics: MetricsFor[S] };
    default: return salesFromCsv(text, source) as { period: string; metrics: MetricsFor[S] };
  }
}
