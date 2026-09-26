// Read-only connectors that pull a lead's data and reduce it to aggregates in memory.
// Patterns come from ceremony-os lib/sync/* (proven in production): Shopify Admin GraphQL,
// Meta Graph insights, GA4 Data API runReport, Search Console searchAnalytics.
// Nothing here writes to the lead's systems, and nothing row-level leaves this file.
import { aggregateOrders, day, periodOf, scrubMetrics, assertNoPii, type Ga4Metrics, type GscMetrics, type MetaMetrics, type OrderLite, type SalesMetrics, type Source } from './lead-metrics';

export const SHOPIFY_API_VERSION = '2025-07';
export const SHOPIFY_READ_SCOPES = ['read_orders', 'read_products', 'read_customers', 'read_analytics'];
export const GRAPH = 'https://graph.facebook.com/v21.0';
export const WINDOW_DAYS = 90;

export type ConnectorEnv = {
  META_ACCESS_TOKEN?: string;           // Virat's Business Manager system-user token (ads_read) that lead ad accounts are shared with
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;        // Virat's Google login that leads add as GA4 / Search Console viewer
};
export type PullResult<M> = { period: string; metrics: M };
type Fetch = typeof fetch;

export function pullWindow(now = new Date(), days = WINDOW_DAYS) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from, to, period: periodOf(from, to) };
}

async function getJson<T>(f: Fetch, url: string, init: RequestInit, label: string): Promise<T> {
  const res = await f(url, init);
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 200);
    throw new Error(`${label} ${res.status}: ${msg}`);
  }
  return data as T;
}

// ---------------------------------------------------------------------------------------------------
// Shopify (custom-app Admin API token, read scopes only)
// ---------------------------------------------------------------------------------------------------

export function normalizeShop(shop: string): string {
  const s = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return s.includes('.') ? s : `${s}.myshopify.com`;
}
export const isValidShopDomain = (shop: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);

// Only ids and money are requested: no email, phone, name or address fields.
const ORDERS_QUERY = `
query Orders($cursor: String, $q: String) {
  orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      createdAt cancelledAt sourceName tags displayFinancialStatus currencyCode
      totalPriceSet { shopMoney { amount } }
      totalRefundedSet { shopMoney { amount } }
      customer { id }
      lineItems(first: 20) { nodes { sku title quantity originalUnitPriceSet { shopMoney { amount } } } }
    }
  }
  productsCount { count }
  customersCount { count }
}`;

type Money = { shopMoney: { amount: string } } | null;
type ShopifyOrder = {
  createdAt: string; cancelledAt: string | null; sourceName: string | null; tags: string[];
  displayFinancialStatus: string | null; currencyCode: string;
  totalPriceSet: Money; totalRefundedSet: Money; customer: { id: string } | null;
  lineItems: { nodes: { sku: string | null; title: string; quantity: number; originalUnitPriceSet: Money }[] };
};
const amt = (m: Money) => (m ? Number(m.shopMoney.amount) || 0 : 0);

export function shopifyOrderToLite(o: ShopifyOrder): OrderLite {
  const status = (o.displayFinancialStatus ?? '').toLowerCase();
  return {
    createdAt: o.createdAt,
    total: amt(o.totalPriceSet),
    refunded: amt(o.totalRefundedSet),
    cancelled: !!o.cancelledAt,
    returned: status.includes('refunded'),
    rto: o.tags.some((t) => /\brto\b/i.test(t)),
    customerKey: o.customer?.id ?? null,
    channel: o.sourceName,
    lines: o.lineItems.nodes.map((l) => ({ sku: l.sku, title: l.title, qty: l.quantity, price: amt(l.originalUnitPriceSet) })),
  };
}

export async function pullShopify(shop: string, token: string, opts: { now?: Date; fetchImpl?: Fetch; maxPages?: number } = {}): Promise<PullResult<SalesMetrics>> {
  const f = opts.fetchImpl ?? fetch;
  const domain = normalizeShop(shop);
  if (!isValidShopDomain(domain)) throw new Error('Shop must be a *.myshopify.com domain');
  const w = pullWindow(opts.now);
  const q = `created_at:>='${day(w.from)}' AND created_at:<='${day(w.to)}T23:59:59Z'`;
  const orders: OrderLite[] = [];
  let cursor: string | null = null, currency = 'INR', products: number | undefined, customers: number | undefined;
  for (let page = 0; page < (opts.maxPages ?? 60); page++) {
    type R = { data?: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrder[] }; productsCount?: { count: number }; customersCount?: { count: number } }; errors?: { message: string }[] };
    const r: R = await getJson<R>(f, `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: ORDERS_QUERY, variables: { cursor, q } }),
    }, 'Shopify');
    if (r.errors?.length || !r.data) throw new Error(`Shopify: ${r.errors?.map((e) => e.message).join('; ') ?? 'no data'}`);
    products ??= r.data.productsCount?.count;
    customers ??= r.data.customersCount?.count;
    for (const o of r.data.orders.nodes) { currency = o.currencyCode || currency; orders.push(shopifyOrderToLite(o)); }
    if (!r.data.orders.pageInfo.hasNextPage) break;
    cursor = r.data.orders.pageInfo.endCursor;
  }
  const metrics = aggregateOrders(orders, currency);
  if (products !== undefined) metrics.products_count = products;
  if (customers !== undefined) metrics.customers_count = customers;
  return { period: w.period, metrics };
}

// ---------------------------------------------------------------------------------------------------
// Meta ads (partner access to Virat's Business Manager; view only)
// ---------------------------------------------------------------------------------------------------

type ActionStat = { action_type: string; value: string };
// Meta reports the same purchases under several action types; take the first present (ceremony-os lesson).
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'];
export function pickPurchase(stats: ActionStat[] | undefined): number {
  for (const t of PURCHASE_TYPES) {
    const hit = stats?.find((s) => s.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

export async function pullMeta(adAccountId: string, env: ConnectorEnv, opts: { now?: Date; fetchImpl?: Fetch } = {}): Promise<PullResult<MetaMetrics>> {
  if (!env.META_ACCESS_TOKEN) throw new Error('META_ACCESS_TOKEN is not set');
  const f = opts.fetchImpl ?? fetch;
  const id = adAccountId.trim().replace(/^act_/, '');
  if (!/^\d{5,20}$/.test(id)) throw new Error('Ad account id should be digits, like act_1234567890');
  const w = pullWindow(opts.now);
  const params = new URLSearchParams({
    level: 'account',
    time_range: JSON.stringify({ since: day(w.from), until: day(w.to) }),
    fields: 'account_currency,spend,impressions,clicks,actions,action_values',
    access_token: env.META_ACCESS_TOKEN,
  });
  type Row = { account_currency?: string; spend?: string; impressions?: string; clicks?: string; actions?: ActionStat[]; action_values?: ActionStat[] };
  const r = await getJson<{ data: Row[] }>(f, `${GRAPH}/act_${id}/insights?${params}`, { method: 'GET' }, 'Meta');
  const row = r.data?.[0] ?? {};
  return {
    period: w.period,
    metrics: {
      currency: row.account_currency ?? 'INR',
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      purchases: pickPurchase(row.actions),
      purchase_value: pickPurchase(row.action_values),
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Google: GA4 and Search Console (Virat's login added as Viewer / restricted user)
// ---------------------------------------------------------------------------------------------------

export async function googleAccessToken(env: ConnectorEnv, f: Fetch = fetch): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Error('Google OAuth env vars are not set');
  const r = await getJson<{ access_token: string }>(f, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  }, 'Google token');
  return r.access_token;
}

const gPost = <T>(f: Fetch, token: string, url: string, body: unknown, label: string) =>
  getJson<T>(f, url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, label);

export async function pullGa4(propertyId: string, env: ConnectorEnv, opts: { now?: Date; fetchImpl?: Fetch; token?: string } = {}): Promise<PullResult<Ga4Metrics>> {
  const f = opts.fetchImpl ?? fetch;
  const id = propertyId.trim().replace(/^properties\//, '');
  if (!/^\d{5,15}$/.test(id)) throw new Error('GA4 property id should be digits, like 312345678');
  const token = opts.token ?? (await googleAccessToken(env, f));
  const w = pullWindow(opts.now);
  type Report = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };
  const r = await gPost<Report>(f, token, `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, {
    dateRanges: [{ startDate: day(w.from), endDate: day(w.to) }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'transactions' }, { name: 'purchaseRevenue' }],
    limit: 50,
  }, 'GA4');
  const m: Ga4Metrics = { sessions: 0, users: 0, transactions: 0, revenue: 0, channels: {} };
  for (const row of r.rows ?? []) {
    const [s, u, t, rev] = row.metricValues.map((v) => Number(v.value) || 0);
    m.sessions += s; m.users += u; m.transactions += t; m.revenue += rev;
    m.channels[row.dimensionValues[0]?.value || '(other)'] = s;
  }
  m.revenue = Math.round(m.revenue * 100) / 100;
  return { period: w.period, metrics: m };
}

export async function pullGsc(siteUrl: string, env: ConnectorEnv, opts: { now?: Date; fetchImpl?: Fetch; token?: string } = {}): Promise<PullResult<GscMetrics>> {
  const f = opts.fetchImpl ?? fetch;
  if (!/^(https?:\/\/|sc-domain:)/.test(siteUrl.trim())) throw new Error('Site should look like https://example.com/ or sc-domain:example.com');
  const token = opts.token ?? (await googleAccessToken(env, f));
  const w = pullWindow(opts.now);
  const to = new Date(w.to.getTime() - 2 * 86_400_000); // GSC lags about 2 days
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl.trim())}/searchAnalytics/query`;
  type Q = { rows?: { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };
  const range = { startDate: day(w.from), endDate: day(to) };
  const [tot, qs] = await Promise.all([
    gPost<Q>(f, token, base, { ...range }, 'Search Console'),
    gPost<Q>(f, token, base, { ...range, dimensions: ['query'], rowLimit: 25 }, 'Search Console'),
  ]);
  const t = tot.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    period: periodOf(w.from, to),
    metrics: {
      clicks: t.clicks, impressions: t.impressions, ctr: Math.round(t.ctr * 10000) / 10000, position: Math.round(t.position * 10) / 10,
      top_queries: (qs.rows ?? []).map((x) => ({ query: x.keys?.[0] ?? '', clicks: x.clicks, impressions: x.impressions, ctr: Math.round(x.ctr * 10000) / 10000, position: Math.round(x.position * 10) / 10 })),
    },
  };
}

/** Last step before any snapshot is written: scrub, then refuse if anything PII-like survived. */
export function safeMetrics<M>(source: Source, metrics: M): M {
  const clean = scrubMetrics(metrics);
  assertNoPii(clean);
  void source;
  return clean;
}
