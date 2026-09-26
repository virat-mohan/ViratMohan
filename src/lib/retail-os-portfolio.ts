import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Reads live DevShop-run stores (Moonglasses, Travaholic Caps, and later every
// provisioned Retail OS brand) straight from each store's own Supabase project,
// read-only, for the founder console and scheduled brand reports.
//
// The money formulas mirror each store's own P&L (moon-glasses-store
// lib/pnl.ts) so the console never disagrees with the store's admin:
//   netSales    = grossSales − discounts − refunds          (non-cancelled orders)
//   cogs        = units sold × COGS_PER_UNIT_RUPEES (fallback COGS_PER_CAP_RUPEES, then 250)
//   expenses    = manual expenses + Meta ad spend + WhatsApp messages + Pay With A Post value
//   netProfit   = netSales − cogs − expenses
// The budget comes from the store's own driver-based business plan
// (moon-glasses-store lib/business-plan-calc.ts, mirrored in planMonth below).

export type LiveBrand = { key: string; name: string; supabaseUrl: string; serviceKey: string };

// A brand can also be added with three separate variables, so its secret key
// never has to be pasted inside the shared JSON:
//   RETAIL_OS_BRAND_<KEY>_NAME, RETAIL_OS_BRAND_<KEY>_URL, RETAIL_OS_BRAND_<KEY>_SERVICE_KEY
function brandsFromSeparateVars(): LiveBrand[] {
  const out: LiveBrand[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    const m = name.match(/^RETAIL_OS_BRAND_([A-Z0-9_]+)_SERVICE_KEY$/);
    if (!m || !value) continue;
    const id = m[1];
    const url = process.env[`RETAIL_OS_BRAND_${id}_URL`];
    if (!url) continue;
    out.push({
      key: id.toLowerCase(),
      name: process.env[`RETAIL_OS_BRAND_${id}_NAME`] || id,
      supabaseUrl: url.trim().replace(/\/+$/, ''),
      serviceKey: value.trim(),
    });
  }
  return out;
}

export function getLiveBrands(): LiveBrand[] {
  const extra = brandsFromSeparateVars();
  const merge = (list: LiveBrand[]) => [...list.filter((b) => !extra.some((e) => e.key === b.key)), ...extra];
  const raw = process.env.RETAIL_OS_LIVE_BRANDS;
  if (!raw) return extra;
  try {
    const parsed = JSON.parse(raw) as Partial<LiveBrand>[];
    // Values copied out of `vercel env pull` can carry surrounding quotes or a
    // literal "\n" from how they were first saved; strip them so the URL and
    // key are exactly what Supabase expects.
    const clean = (v: unknown) => String(v ?? '').replace(/\\[nr]/g, '').replace(/^["'\s]+|["'\s]+$/g, '');
    // Optional non-secret override: RETAIL_OS_BRAND_URLS = {"caps":"https://…supabase.co"}.
    // Lets a store's project URL be corrected without re-handling its key.
    let urlOverrides: Record<string, string> = {};
    try { urlOverrides = JSON.parse(process.env.RETAIL_OS_BRAND_URLS || '{}'); } catch { urlOverrides = {}; }
    const parsedBrands = parsed
      .map((b) => {
        const key = clean(b.key);
        return { key, name: clean(b.name), supabaseUrl: clean(urlOverrides[key] || b.supabaseUrl).replace(/\/+$/, ''), serviceKey: clean(b.serviceKey) };
      })
      .filter((b) => b.key && b.name && b.supabaseUrl && b.serviceKey);
    return merge(parsedBrands);
  } catch (err) {
    console.error('RETAIL_OS_LIVE_BRANDS is not valid JSON', err);
    return extra;
  }
}

// ── Dates (all periods are IST calendar days) ─────────────────────────────

export function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysInMonth(ymd: string): number {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const istStart = (ymd: string) => `${ymd}T00:00:00+05:30`;

export type Period = { key: 'daily' | 'weekly' | 'monthly' | 'mtd'; label: string; start: string; end: string }; // [start, end) as IST dates

export function periodFor(kind: Period['key'], today = istToday()): { current: Period; previous: Period } {
  if (kind === 'daily') {
    const y = addDays(today, -1);
    return {
      current: { key: kind, label: `Yesterday (${y})`, start: y, end: today },
      previous: { key: kind, label: 'Day before', start: addDays(y, -1), end: y },
    };
  }
  if (kind === 'weekly') {
    // Last completed Monday–Sunday week.
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    const thisMonday = addDays(today, -((dow + 6) % 7));
    const start = addDays(thisMonday, -7);
    return {
      current: { key: kind, label: `Week of ${start}`, start, end: thisMonday },
      previous: { key: kind, label: 'Week before', start: addDays(start, -7), end: start },
    };
  }
  const monthStart = `${today.slice(0, 7)}-01`;
  if (kind === 'mtd') {
    const prevStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
    const elapsed = Math.round((Date.parse(today) - Date.parse(monthStart)) / 86400000);
    return {
      current: { key: kind, label: `Month to date (${today.slice(0, 7)})`, start: monthStart, end: addDays(today, 1) },
      previous: { key: kind, label: 'Same days last month', start: prevStart, end: addDays(prevStart, elapsed + 1) },
    };
  }
  const start = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const prevStart = `${addDays(start, -1).slice(0, 7)}-01`;
  return {
    current: { key: kind, label: `Month of ${start.slice(0, 7)}`, start, end: monthStart },
    previous: { key: kind, label: 'Month before', start: prevStart, end: start },
  };
}

// ── Actuals ───────────────────────────────────────────────────────────────

export type Metrics = {
  orders: number;
  units: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  aov: number;
  cogs: number;
  grossProfit: number;
  adSpend: number;
  whatsappCost: number;
  barterValue: number;
  otherExpenses: number;
  netProfit: number;
  codOrders: number;
  barterOrders: number;
};

async function setting(db: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

async function metaSpend(db: SupabaseClient, since: string, untilInclusive: string): Promise<number> {
  const [token, account] = await Promise.all([setting(db, 'META_ACCESS_TOKEN'), setting(db, 'META_AD_ACCOUNT_ID')]);
  if (!token || !account) return 0;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/act_${account.replace(/^act_/, '')}/insights?` +
        new URLSearchParams({ fields: 'spend', time_range: JSON.stringify({ since, until: untilInclusive }), access_token: token }),
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as { data?: { spend?: string }[] };
    return Math.round(Number(data.data?.[0]?.spend ?? 0));
  } catch {
    return 0;
  }
}

export async function brandMetrics(brand: LiveBrand, period: Period): Promise<Metrics> {
  const db = brandClient(brand);

  const { data: ordersRaw, error } = await db
    .from('orders')
    .select('*')
    .gte('created_at', istStart(period.start))
    .lt('created_at', istStart(period.end))
    .neq('status', 'cancelled');
  if (error) throw new Error(/invalid api key/i.test(error.message)
    ? `${brand.name}: Supabase rejected the service key ("${error.message}"). It is not a current key of project "${describeBrandKey(brand).urlRef}": copy that project's service_role key from Settings → API keys into RETAIL_OS_LIVE_BRANDS in Vercel and redeploy.`
    : `${brand.name}: orders query failed: ${error.message}`);
  const orders = (ordersRaw ?? []) as Record<string, unknown>[];
  const n = (v: unknown) => Number(v ?? 0) || 0;

  let grossSales = 0, discounts = 0, refunds = 0, barterValue = 0, codOrders = 0, barterOrders = 0;
  for (const o of orders) {
    grossSales += n(o.subtotal);
    discounts += n(o.discount_amount) + n(o.referral_discount_amount) + n(o.loyalty_discount_amount) + n(o.coupon_discount_amount);
    refunds += n(o.refunded_amount);
    if (o.is_post_barter) { barterValue += n(o.subtotal); barterOrders++; }
    if (o.payment_type === 'cod_advance') codOrders++;
  }

  let units = 0;
  const ids = orders.map((o) => String(o.id));
  for (let i = 0; i < ids.length; i += 200) {
    const { data: items } = await db.from('order_items').select('quantity').in('order_id', ids.slice(i, i + 200));
    units += (items ?? []).reduce((s, it) => s + n((it as { quantity?: number }).quantity), 0);
  }

  const [cogsSetting, capSetting, waCostSetting] = await Promise.all([
    setting(db, 'COGS_PER_UNIT_RUPEES'), setting(db, 'COGS_PER_CAP_RUPEES'), setting(db, 'MSG91_WHATSAPP_COST_PER_MESSAGE_RUPEES'),
  ]);
  const costPerUnit = Number(cogsSetting ?? capSetting ?? 250) || 250;

  const [{ data: expenses }, { count: waCount }, adSpend] = await Promise.all([
    db.from('expenses').select('amount').gte('expense_date', period.start).lt('expense_date', period.end),
    db.from('whatsapp_messages').select('id', { count: 'exact', head: true }).gte('sent_at', istStart(period.start)).lt('sent_at', istStart(period.end)),
    metaSpend(db, period.start, addDays(period.end, -1)),
  ]);
  const otherExpenses = (expenses ?? []).reduce((s, e) => s + n((e as { amount?: number }).amount), 0);
  const whatsappCost = Math.round((waCount ?? 0) * (Number(waCostSetting ?? 0.87) || 0.87));

  const netSales = grossSales - discounts - refunds;
  const cogs = units * costPerUnit;
  const grossProfit = netSales - cogs;
  const netProfit = grossProfit - otherExpenses - adSpend - whatsappCost - barterValue;

  return {
    orders: orders.length, units, grossSales, discounts, refunds, netSales,
    aov: orders.length ? Math.round(netSales / orders.length) : 0,
    cogs, grossProfit, adSpend, whatsappCost, barterValue, otherExpenses, netProfit, codOrders, barterOrders,
  };
}

// ── Budget from the store's own business plan ─────────────────────────────

export type Budget = { orders: number; revenue: number; adSpend: number; profit: number };

type StorePlanDrivers = {
  categories: { priceRupees: number; shareOfOrdersPct: number; productCostPct: number }[];
  cities: { monthlyOrders: [number, number, number]; cacRupeesPerOrder: number }[];
  shippingPolicy: { prepaidMode: string; prepaidChargeRupees: number; codEnabled: boolean; codMode: string; codChargeRupees: number };
  packagingCostPerOrderRupees: number; adminTechPct: number; codSharePct: number; paymentGatewayFeePct: number;
  codHandlingFeePct: number; rtoRatePct: number; rtoCostPerOrderRupees: number; ndrCostPerOrderRupees: number;
  shippingCostPerOrderRupees: number; postBarterSharePct: number; fixedCostLines: { amountRupees: number }[];
};

// Mirror of moon-glasses-store lib/business-plan-calc.ts computeMonth (platform fee 0).
function planMonth(d: StorePlanDrivers, i: 0 | 1 | 2): Budget {
  const orders = d.cities.reduce((s, c) => s + (c.monthlyOrders?.[i] ?? 0), 0);
  const cac = d.cities.reduce((s, c) => s + (c.monthlyOrders?.[i] ?? 0) * c.cacRupeesPerOrder, 0);
  const blended = d.categories.reduce((s, c) => s + c.priceRupees * (c.shareOfOrdersPct / 100), 0);
  let productRevenue = 0, productCost = 0;
  for (const c of d.categories) {
    const co = orders * (c.shareOfOrdersPct / 100);
    productRevenue += co * c.priceRupees;
    productCost += co * c.priceRupees * (c.productCostPct / 100);
  }
  const barter = orders * (d.postBarterSharePct / 100);
  const cash = orders - barter;
  const cod = d.shippingPolicy.codEnabled ? cash * (d.codSharePct / 100) : 0;
  const prepaid = cash - cod;
  const shippingRevenue = (d.shippingPolicy.prepaidMode === 'charged' ? prepaid * d.shippingPolicy.prepaidChargeRupees : 0)
    + (d.shippingPolicy.codEnabled && d.shippingPolicy.codMode === 'charged' ? cod * d.shippingPolicy.codChargeRupees : 0);
  const revenue = productRevenue + shippingRevenue;
  const cogs = productCost + orders * d.packagingCostPerOrderRupees;
  const opex = cac + revenue * (d.adminTechPct / 100) + prepaid * blended * (d.paymentGatewayFeePct / 100)
    + cod * blended * (d.codHandlingFeePct / 100) + cod * (d.rtoRatePct / 100) * d.rtoCostPerOrderRupees
    + cod * d.ndrCostPerOrderRupees + orders * d.shippingCostPerOrderRupees + barter * blended
    + (d.fixedCostLines ?? []).reduce((s, l) => s + l.amountRupees, 0);
  return { orders, revenue, adSpend: cac, profit: revenue - cogs - opex };
}

// Budget for any IST date range: each day gets its month's plan ÷ days in that month.
export async function brandBudget(brand: LiveBrand, period: Period): Promise<Budget | null> {
  const db = brandClient(brand);
  const { data, error } = await db.from('business_plans').select('quarter_start, drivers').order('quarter_start', { ascending: false }).limit(8);
  if (error || !data?.length) return null;
  const plans = data as { quarter_start: string; drivers: StorePlanDrivers }[];

  const total: Budget = { orders: 0, revenue: 0, adSpend: 0, profit: 0 };
  let covered = 0;
  const monthCache = new Map<string, Budget | null>();
  for (let day = period.start; day < period.end; day = addDays(day, 1)) {
    const month = day.slice(0, 7);
    if (!monthCache.has(month)) {
      const plan = plans.find((p) => {
        const q = p.quarter_start.slice(0, 7);
        const idx = (Number(month.slice(0, 4)) - Number(q.slice(0, 4))) * 12 + (Number(month.slice(5)) - Number(q.slice(5)));
        return idx >= 0 && idx <= 2;
      });
      if (!plan) monthCache.set(month, null);
      else {
        const q = plan.quarter_start.slice(0, 7);
        const idx = ((Number(month.slice(0, 4)) - Number(q.slice(0, 4))) * 12 + (Number(month.slice(5)) - Number(q.slice(5)))) as 0 | 1 | 2;
        try { monthCache.set(month, planMonth(plan.drivers, idx)); } catch { monthCache.set(month, null); }
      }
    }
    const m = monthCache.get(month);
    if (!m) continue;
    const share = 1 / daysInMonth(day);
    total.orders += m.orders * share; total.revenue += m.revenue * share;
    total.adSpend += m.adSpend * share; total.profit += m.profit * share;
    covered++;
  }
  return covered ? total : null;
}

// ── UX friction from the store's Microsoft Clarity snapshot ──────────────
// Travaholic Caps syncs Clarity's live insights into app_settings
// (lib/clarity-insights.ts); this surfaces the worst pages for the console.

export type FrictionPage = { url: string; sessions: number; rageClicks: number; deadClicks: number; quickbacks: number };

export async function clarityFriction(brand: LiveBrand): Promise<{ fetchedAt: string; pages: FrictionPage[] } | null> {
  const db = brandClient(brand);
  const raw = await setting(db, 'CLARITY_INSIGHTS_SNAPSHOT').catch(() => null);
  if (!raw) return null;
  try {
    const snap = JSON.parse(raw) as { fetchedAt: string; urls: FrictionPage[] };
    const score = (p: FrictionPage) => (p.rageClicks ?? 0) * 3 + (p.deadClicks ?? 0) + (p.quickbacks ?? 0) * 2;
    const pages = [...(snap.urls ?? [])].filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a)).slice(0, 3);
    return { fetchedAt: snap.fetchedAt, pages };
  } catch {
    return null;
  }
}

// ── Levers: rule-based for now, read straight off actuals vs plan ─────────

export type Lever = { title: string; detail: string };

export function leversFor(m: Metrics, budget: Budget | null): Lever[] {
  const out: Lever[] = [];
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  if (budget && budget.revenue > 0 && m.netSales < budget.revenue * 0.9) {
    out.push({ title: `Revenue ${100 - pct(m.netSales, budget.revenue)}% behind plan`, detail: 'Move budget to the best-returning campaigns, and check stock on best sellers before scaling spend.' });
  }
  if (m.adSpend > 0 && m.netSales / m.adSpend < 2) {
    out.push({ title: `Return on ad spend is ${(m.netSales / m.adSpend).toFixed(1)}×`, detail: 'Pause campaigns below break-even and rework creatives before adding budget.' });
  }
  if (m.orders >= 10 && m.codOrders / m.orders > 0.4) {
    out.push({ title: `${pct(m.codOrders, m.orders)}% of orders are cash on delivery`, detail: 'Push prepaid: a small prepaid-only discount or a higher COD advance cuts return-to-origin losses.' });
  }
  if (m.grossSales > 0 && m.discounts / m.grossSales > 0.12) {
    out.push({ title: `Discounts are ${pct(m.discounts, m.grossSales)}% of sales`, detail: 'Tighten coupon and rule stacking; discounts come straight out of gross profit.' });
  }
  if (m.grossSales > 0 && m.refunds / m.grossSales > 0.05) {
    out.push({ title: `Refunds are ${pct(m.refunds, m.grossSales)}% of sales`, detail: 'Check return reasons: sizing, quality or delivery damage each have a different fix.' });
  }
  if (m.netSales > 0 && m.grossProfit / m.netSales < 0.5) {
    out.push({ title: `Gross margin is ${pct(m.grossProfit, m.netSales)}%`, detail: 'Review pricing and product cost; below 50% leaves little room for marketing.' });
  }
  if (budget && budget.orders > 0 && m.orders > 0 && m.aov < (budget.revenue / budget.orders) * 0.9) {
    out.push({ title: 'Average order value below plan', detail: 'Add bundles or a buy-N rule to lift basket size.' });
  }
  return out;
}

// ── Connection diagnostics ────────────────────────────────────────────────
// "Invalid API key" from Supabase means the key is not one of THIS project's
// keys: pasted from another project, truncated, or rotated. Read the key
// before using it so the error names the exact fix instead of a bare 401.

export type BrandKeyInfo = {
  urlRef: string;                        // project ref taken from the URL host
  keyType: 'service_role' | 'anon' | 'secret' | 'unknown';
  keyRef: string | null;                 // project ref inside a legacy JWT key (null for sb_secret_ keys)
  problem: string | null;                // null when the key looks right for the URL
};

function projectRef(url: string): string {
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in)/i);
  return m ? m[1].toLowerCase() : '';
}

export function describeBrandKey(brand: Pick<LiveBrand, 'name' | 'supabaseUrl' | 'serviceKey'>): BrandKeyInfo {
  const urlRef = projectRef(brand.supabaseUrl);
  const key = (brand.serviceKey || '').trim();
  const fix = `Fix RETAIL_OS_LIVE_BRANDS (or RETAIL_OS_BRAND_*_SERVICE_KEY) in Vercel with the service_role key of the "${brand.name}" Supabase project, then redeploy.`;
  if (!urlRef) return { urlRef, keyType: 'unknown', keyRef: null, problem: `${brand.name}: supabaseUrl "${brand.supabaseUrl}" is not a Supabase project URL. ${fix}` };
  if (key.startsWith('sb_secret_')) return { urlRef, keyType: 'secret', keyRef: null, problem: null };
  if (key.startsWith('sb_publishable_')) return { urlRef, keyType: 'anon', keyRef: null, problem: `${brand.name}: the key is a publishable key; reports need the service_role (or sb_secret_) key. ${fix}` };
  const parts = key.split('.');
  if (parts.length !== 3) return { urlRef, keyType: 'unknown', keyRef: null, problem: `${brand.name}: the service key is not a valid Supabase key (${key.length} characters). ${fix}` };
  let payload: { ref?: string; role?: string } = {};
  try { payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch {
    return { urlRef, keyType: 'unknown', keyRef: null, problem: `${brand.name}: the service key could not be decoded. ${fix}` };
  }
  const keyRef = (payload.ref || '').toLowerCase() || null;
  const keyType = payload.role === 'service_role' ? 'service_role' : payload.role === 'anon' ? 'anon' : 'unknown';
  if (keyRef && keyRef !== urlRef) return { urlRef, keyType, keyRef, problem: `${brand.name}: the service key belongs to Supabase project "${keyRef}" but the URL points at project "${urlRef}". ${fix}` };
  if (keyType === 'anon') return { urlRef, keyType, keyRef, problem: `${brand.name}: the key is the anon key; reports need the service_role key. ${fix}` };
  return { urlRef, keyType, keyRef, problem: null };
}

export function brandClient(brand: LiveBrand): SupabaseClient {
  const info = describeBrandKey(brand);
  if (info.problem) throw new Error(info.problem);
  return createClient(brand.supabaseUrl, brand.serviceKey, { auth: { persistSession: false } });
}

export type BrandConnection = { key: string; name: string; ok: boolean; message: string; urlRef: string; keyType: BrandKeyInfo['keyType']; ms: number };

// One cheap read per brand, with the error translated into the fix.
export async function checkBrandConnection(brand: LiveBrand): Promise<BrandConnection> {
  const info = describeBrandKey(brand);
  const base = { key: brand.key, name: brand.name, urlRef: info.urlRef, keyType: info.keyType };
  if (info.problem) return { ...base, ok: false, message: info.problem, ms: 0 };
  const t = Date.now();
  try {
    const db = createClient(brand.supabaseUrl, brand.serviceKey, { auth: { persistSession: false } });
    const { error } = await db.from('orders').select('id', { count: 'exact', head: true }).limit(1);
    const ms = Date.now() - t;
    if (error) {
      const m = /invalid api key/i.test(error.message)
        ? `${brand.name}: Supabase rejected the key ("${error.message}"). It is not a current key of project "${info.urlRef}" (rotated or from another project). Copy the service_role key from that project's Settings → API keys into Vercel and redeploy.`
        : `${brand.name}: ${error.message}`;
      return { ...base, ok: false, message: m, ms };
    }
    return { ...base, ok: true, message: 'Connected', ms };
  } catch (err) {
    return { ...base, ok: false, message: `${brand.name}: ${err instanceof Error ? err.message : String(err)}`, ms: Date.now() - t };
  }
}
