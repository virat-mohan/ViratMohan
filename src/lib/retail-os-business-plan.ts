// Quarterly business-plan / benchmark P&L generator for DevShop Retail OS
// applications.
//
// ARCHITECTURE (v2 — see the "Business Plan Module Guide" artifact for the
// full writeup this mirrors):
// 1. Server-side, deterministic: if the brand has a Shopify store, fetch
//    its real public catalog (`{url}/products.json`) before calling Claude
//    at all — this is ground truth, no reason to make the model guess or
//    search for data we can just fetch.
// 2. Claude does its own market research via the native web_search server
//    tool — industry sizing, competitor pricing, city-level spend, and
//    (when no Shopify catalog exists) the brand's own website/Instagram if
//    it has one — then calls the quarterly_business_plan tool with a small
//    set of DRIVERS (orders/month, AOV, COGS%, CAC%, admin/tech%), not
//    final rupee figures.
// 3. Revenue/COGS/CAC/admin-tech per month, and profit-pool/share totals,
//    are computed from those drivers in computePlanFromDrivers() below —
//    server-side, deterministic, every time. This is what makes the plan
//    "connected": editing a driver later (from the admin page) re-runs the
//    exact same function and overwrites the plan in place, formulas intact.
//
// VERIFY BEFORE FIRST REAL RUN: the native web_search tool's exact type
// string / beta header requirement can change as Anthropic's API evolves.
// The values below (`web_search_20250305`, no beta header) are what's
// current as of this file's prompt_version — if the first real call 4xxs
// on the tool definition, check the current Anthropic API docs for the
// tool's current type string and whether an `anthropic-beta` header is
// still required, and update ANTHROPIC_VERSION / WEB_SEARCH_TOOL_TYPE here.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8000;
export const BUSINESS_PLAN_PROMPT_VERSION = '2026-09-23.2-native-search-drivers';
const CLAUDE_TIMEOUT_MS = 170_000; // native search takes longer than a plain call

export type PlanAssumption = { label: string; value: string; rationale: string; basis: 'supplied_research' | 'brand_data' | 'industry_benchmark_general_knowledge' };
export type PlanDrivers = {
  ordersM1: number; ordersM2: number; ordersM3: number;
  aovInr: number; cogsPct: number; cacPct: number; adminTechPct: number;
  // Payments mix and fees — all three are gateway-style fees on realised
  // revenue: gateway fee on the prepaid share, COD handling fee on the COD
  // share, and Pay with a Post's own 1% platform fee (DevShop's, not
  // researched — see generate-plan.ts) on whatever revenue flows through it.
  codOrderSharePct: number; paymentGatewayFeePct: number; codHandlingFeePct: number; postBarterFeePct: number;
  // Logistics — RTO is COD-specific (charged on the returned share of COD orders only).
  rtoRatePct: number; rtoCostPerOrderInr: number; shippingCostPerOrderInr: number; packagingCostPerOrderInr: number;
  // Fixed monthly platform/tooling cost (Shopify, WhatsApp Business API, apps) — constant across the quarter.
  platformToolsFixedInrPerMonth: number;
};
export type PlanMonth = {
  label: string; orders: number; revenueInr: number; cogsInr: number; cacInr: number; adminTechInr: number;
  codOrders: number; prepaidOrders: number; gatewayFeeInr: number; codHandlingFeeInr: number; postBarterFeeInr: number;
  rtoOrders: number; rtoCostInr: number; shippingInr: number; packagingInr: number;
  platformToolsInr: number; operatingExpensesInr: number;
  profitPoolInr: number; devshopShareInr: number; founderShareInr: number;
};
export type PlanCity = { city: string; revenueSharePct: number; rationale: string };

export type BusinessPlanOutput = {
  assumptions: PlanAssumption[];
  drivers: PlanDrivers;
  driverRationale: {
    aov: string; orders: string; cogsPct: string; cacPct: string; adminTechPct: string;
    payments: string; logistics: string; platformTools: string;
  };
  cityBreakdown: PlanCity[];
  risks: string[];
  sourcesCited: string[];
};

const PLAN_TOOL = {
  name: 'quarterly_business_plan',
  description: 'A grounded 3-month benchmark P&L for a D2C brand, expressed as editable drivers (not fixed totals) plus a cited rationale for each.',
  input_schema: {
    type: 'object',
    properties: {
      assumptions: {
        type: 'array',
        description: 'Qualitative or supporting assumptions that do not map directly to a numeric driver — target segment, positioning, seasonality notes, etc.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string' },
            rationale: { type: 'string' },
            basis: { type: 'string', enum: ['supplied_research', 'brand_data', 'industry_benchmark_general_knowledge'] },
          },
          required: ['label', 'value', 'rationale', 'basis'],
        },
      },
      drivers: {
        type: 'object',
        description: 'The numeric drivers the whole plan is computed from.',
        properties: {
          ordersM1: { type: 'number', description: 'Orders in month 1' },
          ordersM2: { type: 'number', description: 'Orders in month 2' },
          ordersM3: { type: 'number', description: 'Orders in month 3' },
          aovInr: { type: 'number', description: 'Average order value in INR, held constant across the quarter' },
          cogsPct: { type: 'number', description: 'Cost of goods + packaging as a percent of revenue' },
          cacPct: { type: 'number', description: 'Customer acquisition cost as a percent of revenue' },
          adminTechPct: { type: 'number', description: 'Admin + tech subscriptions as a percent of revenue' },
          codOrderSharePct: { type: 'number', description: 'Percent of orders that are Cash on Delivery vs prepaid, for this category/city mix' },
          paymentGatewayFeePct: { type: 'number', description: 'Payment gateway fee, as a percent of the prepaid share of revenue only' },
          codHandlingFeePct: { type: 'number', description: 'Courier COD collection fee, as a percent of the COD share of revenue only' },
          rtoRatePct: { type: 'number', description: 'Return-to-origin rate as a percent of COD orders (COD RTO is typically far higher than prepaid)' },
          rtoCostPerOrderInr: { type: 'number', description: 'Wasted forward+reverse shipping cost per RTO order, in INR' },
          shippingCostPerOrderInr: { type: 'number', description: 'Net forward shipping/courier cost per order, in INR (after any amount charged to the customer)' },
          packagingCostPerOrderInr: { type: 'number', description: 'Packaging and inserts cost per order, in INR' },
          platformToolsFixedInrPerMonth: { type: 'number', description: 'Fixed monthly cost of Shopify/platform subscription, WhatsApp Business API, and other required tooling, in INR' },
        },
        required: [
          'ordersM1', 'ordersM2', 'ordersM3', 'aovInr', 'cogsPct', 'cacPct', 'adminTechPct',
          'codOrderSharePct', 'paymentGatewayFeePct', 'codHandlingFeePct',
          'rtoRatePct', 'rtoCostPerOrderInr', 'shippingCostPerOrderInr', 'packagingCostPerOrderInr',
          'platformToolsFixedInrPerMonth',
        ],
      },
      driverRationale: {
        type: 'object',
        description: 'One rationale per driver group, citing what it is grounded in — this is what a founder will read to trust the number.',
        properties: {
          orders: { type: 'string' },
          aov: { type: 'string' },
          cogsPct: { type: 'string' },
          cacPct: { type: 'string' },
          adminTechPct: { type: 'string' },
          payments: { type: 'string', description: 'Covers COD share, gateway fee, and COD handling fee together (do not mention Pay with a Post here — that fee is fixed by DevShop, not researched)' },
          logistics: { type: 'string', description: 'Covers RTO rate/cost, shipping, and packaging together' },
          platformTools: { type: 'string' },
        },
        required: ['orders', 'aov', 'cogsPct', 'cacPct', 'adminTechPct', 'payments', 'logistics', 'platformTools'],
      },
      cityBreakdown: {
        type: 'array',
        items: {
          type: 'object',
          properties: { city: { type: 'string' }, revenueSharePct: { type: 'number' }, rationale: { type: 'string' } },
          required: ['city', 'revenueSharePct', 'rationale'],
        },
      },
      risks: { type: 'array', items: { type: 'string' } },
      sourcesCited: { type: 'array', items: { type: 'string' }, description: 'URLs or named sources actually found and used via web search.' },
    },
    required: ['assumptions', 'drivers', 'driverRationale', 'cityBreakdown', 'risks', 'sourcesCited'],
  },
} as const;

const SYSTEM_PROMPT = `You are a senior D2C e-commerce financial analyst building a quarterly business plan and benchmark P&L for one brand on DevShop Retail OS.

You have a native web search tool. Use it to actually research: category market size in India, city-level consumer spend or online-shopping behaviour for the brand's target cities, competitor pricing, customer behaviour and return-rate benchmarks for this category. If the brand has no live website or Shopify catalog supplied to you directly, also search for its Instagram handle or any public presence to understand its actual product offering and positioning before estimating anything.

Hard rules:
- Ground every driver in what you actually found — cite it in that driver's rationale. Where you can't find something specific, say so explicitly ("no city-level data found for X — using a general India D2C benchmark") and mark that assumption's basis as industry_benchmark_general_knowledge rather than passing a guess off as researched.
- Express the plan as DRIVERS, not final totals: orders per month (a realistic ramp across 3 months, not identical numbers), average order value, COGS%, CAC%, admin/tech% of revenue, plus the full cost-to-operate picture: COD vs prepaid mix, payment gateway fee, COD handling fee, RTO rate and cost, shipping cost per order, packaging cost per order, and a fixed monthly platform/tooling cost. You are not asked to compute revenue or profit — that happens outside this tool, deterministically, from the drivers you give.
- Use conservative, defensible estimates appropriate for an early-stage or scaling D2C brand — not best-case numbers. RTO rates in particular are commonly underestimated — research the actual category/COD benchmark rather than assuming a low number.
- COGS%, CAC%, admin/tech%, COD share, and RTO rate should reflect the actual category and city mix, not a generic default unless research genuinely supports that split for this brand.
- Pay with a Post's fee is fixed by DevShop (1% of revenue when opted in) and is applied outside this tool — do not estimate anything for it.
- The plan must show a real, positive profit pool every month. As a working reference, cogsPct + cacPct + adminTechPct should sit near 25% + 25% + 10% = 60% of revenue for a typical brand, leaving room for gateway/COD/RTO/shipping/packaging costs and still landing with a healthy margin. If your researched numbers for this category would push total costs close to or over revenue, use the more conservative (lower-cost) end of the range you found rather than the higher end — a benchmark plan that shows a loss is not useful to a founder deciding whether to sign up. Say in the rationale if you pulled a driver toward the conservative end for this reason.
- Every driver's rationale should be something a skeptical founder would accept, in one or two sentences, naming what you found.

Output only through the quarterly_business_plan tool.`;

export type BrandContext = {
  brandName: string;
  category: string | null;
  format: string | null;
  hasRevenue: string | null;
  revenueRange: string | null;
  following: string | null;
  productCount: string | null;
  targetCities: string | null;
  handle: string | null;
  shopifyUrl: string | null;
  postBarterOptIn: boolean;
};

async function fetchShopifyCatalogSummary(shopifyUrl: string): Promise<string | null> {
  try {
    const base = shopifyUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/products.json?limit=50`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { products?: Array<{ title: string; variants?: Array<{ price: string }> }> };
    const products = data.products ?? [];
    if (products.length === 0) return null;
    const prices = products.flatMap((p) => (p.variants ?? []).map((v) => parseFloat(v.price)).filter((n) => !isNaN(n)));
    const min = prices.length ? Math.min(...prices) : null;
    const max = prices.length ? Math.max(...prices) : null;
    const sample = products.slice(0, 12).map((p) => p.title).join(', ');
    return `Fetched live from the brand's own Shopify store (${products.length} products found). Price range: ${min != null ? `₹${min}–₹${max}` : 'not available'}. Sample products: ${sample}.`;
  } catch {
    return null; // network/parse failure — not fatal, the model falls back to search
  }
}

function buildUserMessage(app: BrandContext, catalogSummary: string | null): string {
  return `BRAND CONTEXT
Brand: ${app.brandName}
Category: ${app.category ?? 'not specified'}
Format: ${app.format ?? 'not specified'}
Existing revenue: ${app.hasRevenue === 'yes' ? (app.revenueRange ?? 'yes, range not specified') : 'none — pre-revenue'}
Following: ${app.following ?? 'not specified'}
Catalog size (self-reported): ${app.productCount ?? 'not specified'}
Target cities: ${app.targetCities ?? 'not specified — research general India D2C city patterns for this category'}
Instagram / handle: ${app.handle ?? 'not provided'}
Shopify store: ${app.shopifyUrl ?? 'not provided'}
Pay with a Post: ${app.postBarterOptIn ? 'opted in (its fee is applied outside this tool, do not estimate it)' : 'not opted in'}

${catalogSummary ? `BRAND'S OWN CATALOG (fetched directly — treat as ground truth, do not search for this)\n${catalogSummary}\n` : "No live catalog was fetchable. Search for the brand's website or Instagram if either was given above, to understand its actual product offering before estimating.\n"}

Research the category and these target cities, then build the 3-month benchmark P&L as drivers.`;
}

export async function generateBusinessPlan(app: BrandContext, apiKey: string): Promise<BusinessPlanOutput> {
  const catalogSummary = app.shopifyUrl ? await fetchShopifyCatalogSummary(app.shopifyUrl) : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(app, catalogSummary) }],
        tools: [{ type: WEB_SEARCH_TOOL_TYPE, name: 'web_search' }, PLAN_TOOL],
        tool_choice: { type: 'auto' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
    const toolUse = data.content.find((b) => b.type === 'tool_use' && b.name === PLAN_TOOL.name);
    if (!toolUse?.input) {
      throw new Error('Model did not call quarterly_business_plan — it may have stopped mid-research. Try again.');
    }
    return toolUse.input as unknown as BusinessPlanOutput;
  } finally {
    clearTimeout(timeout);
  }
}

// DevShop's operating strategy: COGS ≤ 25%, CAC ≤ 25%, and admin plus every
// other cost (fees, shipping, packing, RTO, platform) held to 10% of revenue,
// so the benchmark profit pool is never below 40%. Researched drivers above
// these caps are pulled down to them; lower ones are kept.
// Orders ramp from 25 a day in month 1 (750, 1,000, 1,250 on a 30-day
// month); researched volumes above the ramp are kept.
export const DAYS_PER_MONTH = 30;
export const STRATEGY = { cogsPct: 25, cacPct: 25, adminAndOtherPct: 10, ordersFloor: [750, 1000, 1250] as const };
export const perDay = (ordersInMonth: number) => Math.round((ordersInMonth / DAYS_PER_MONTH) * 10) / 10;
export function belowStrategy(d: PlanDrivers): boolean {
  return d.ordersM1 < STRATEGY.ordersFloor[0] || d.ordersM2 < STRATEGY.ordersFloor[1] || d.ordersM3 < STRATEGY.ordersFloor[2];
}
export function applyStrategy<T extends PlanDrivers>(d: T): T {
  const x: T = {
    ...d,
    ordersM1: Math.max(d.ordersM1, STRATEGY.ordersFloor[0]),
    ordersM2: Math.max(d.ordersM2, STRATEGY.ordersFloor[1]),
    ordersM3: Math.max(d.ordersM3, STRATEGY.ordersFloor[2]),
    cogsPct: Math.min(d.cogsPct, STRATEGY.cogsPct),
    cacPct: Math.min(d.cacPct, STRATEGY.cacPct),
  };
  const probe = computePlanFromDrivers({ ...x, adminTechPct: 0 }, 0).quarterTotals;
  const opexPct = probe.revenueInr > 0 ? (probe.operatingExpensesInr / probe.revenueInr) * 100 : 0;
  if (opexPct > STRATEGY.adminAndOtherPct) {
    const f = STRATEGY.adminAndOtherPct / opexPct;
    const r1 = (n: number) => Math.round(n * f * 100) / 100;
    x.paymentGatewayFeePct = r1(d.paymentGatewayFeePct);
    x.codHandlingFeePct = r1(d.codHandlingFeePct);
    x.postBarterFeePct = r1(d.postBarterFeePct);
    x.rtoCostPerOrderInr = Math.round(d.rtoCostPerOrderInr * f);
    x.shippingCostPerOrderInr = Math.round(d.shippingCostPerOrderInr * f);
    x.packagingCostPerOrderInr = Math.round(d.packagingCostPerOrderInr * f);
    x.platformToolsFixedInrPerMonth = Math.round(d.platformToolsFixedInrPerMonth * f);
    x.adminTechPct = 0;
  } else {
    x.adminTechPct = Math.min(d.adminTechPct, Math.round((STRATEGY.adminAndOtherPct - opexPct) * 10) / 10);
  }
  return x;
}

// The one place monthly figures and shares are ever computed — called on
// initial generation AND on every human edit to the drivers, so "editing a
// number updates the plan" and "the LLM's plan" are always the same code
// path, never two.
export function computePlanFromDrivers(drivers: PlanDrivers, splitPct: number): { months: PlanMonth[]; quarterTotals: Record<string, number> } {
  const orders = [drivers.ordersM1, drivers.ordersM2, drivers.ordersM3];
  const months: PlanMonth[] = orders.map((o, i) => {
    const revenueInr = Math.round(o * drivers.aovInr);
    const cogsInr = Math.round(revenueInr * (drivers.cogsPct / 100));
    const cacInr = Math.round(revenueInr * (drivers.cacPct / 100));
    const adminTechInr = Math.round(revenueInr * (drivers.adminTechPct / 100));

    const codOrders = Math.round(o * (drivers.codOrderSharePct / 100));
    const prepaidOrders = o - codOrders;
    const gatewayFeeInr = Math.round(prepaidOrders * drivers.aovInr * (drivers.paymentGatewayFeePct / 100));
    const codHandlingFeeInr = Math.round(codOrders * drivers.aovInr * (drivers.codHandlingFeePct / 100));
    const postBarterFeeInr = Math.round(revenueInr * (drivers.postBarterFeePct / 100));
    const rtoOrders = Math.round(codOrders * (drivers.rtoRatePct / 100));
    const rtoCostInr = Math.round(rtoOrders * drivers.rtoCostPerOrderInr);
    const shippingInr = Math.round(o * drivers.shippingCostPerOrderInr);
    const packagingInr = Math.round(o * drivers.packagingCostPerOrderInr);
    const platformToolsInr = Math.round(drivers.platformToolsFixedInrPerMonth);
    const operatingExpensesInr = gatewayFeeInr + codHandlingFeeInr + postBarterFeeInr + rtoCostInr + shippingInr + packagingInr + platformToolsInr;

    // A benchmark forecast shown to a prospective brand should never read as a
    // loss — floor at zero rather than show a negative share. The full cost
    // breakdown above (cogs, cac, admin/tech, fees, RTO, shipping, packaging)
    // is still shown in full on the plan, so the real cost structure stays
    // visible even when the bottom line is floored.
    const profitPoolInr = Math.max(0, revenueInr - cogsInr - cacInr - adminTechInr - operatingExpensesInr);
    const devshopShareInr = Math.round(profitPoolInr * (splitPct / 100));
    return {
      label: `Month ${i + 1}`, orders: o, revenueInr, cogsInr, cacInr, adminTechInr,
      codOrders, prepaidOrders, gatewayFeeInr, codHandlingFeeInr, postBarterFeeInr,
      rtoOrders, rtoCostInr, shippingInr, packagingInr,
      platformToolsInr, operatingExpensesInr,
      profitPoolInr, devshopShareInr, founderShareInr: profitPoolInr - devshopShareInr,
    };
  });
  const quarterTotals = months.reduce(
    (acc, m) => ({
      ordersTotal: acc.ordersTotal + m.orders,
      revenueInr: acc.revenueInr + m.revenueInr,
      cogsInr: acc.cogsInr + m.cogsInr,
      cacInr: acc.cacInr + m.cacInr,
      adminTechInr: acc.adminTechInr + m.adminTechInr,
      gatewayFeeInr: acc.gatewayFeeInr + m.gatewayFeeInr,
      codHandlingFeeInr: acc.codHandlingFeeInr + m.codHandlingFeeInr,
      postBarterFeeInr: acc.postBarterFeeInr + m.postBarterFeeInr,
      rtoCostInr: acc.rtoCostInr + m.rtoCostInr,
      shippingInr: acc.shippingInr + m.shippingInr,
      packagingInr: acc.packagingInr + m.packagingInr,
      platformToolsInr: acc.platformToolsInr + m.platformToolsInr,
      operatingExpensesInr: acc.operatingExpensesInr + m.operatingExpensesInr,
      profitPoolInr: acc.profitPoolInr + m.profitPoolInr,
      devshopShareInr: acc.devshopShareInr + m.devshopShareInr,
      founderShareInr: acc.founderShareInr + m.founderShareInr,
    }),
    {
      ordersTotal: 0, revenueInr: 0, cogsInr: 0, cacInr: 0, adminTechInr: 0,
      gatewayFeeInr: 0, codHandlingFeeInr: 0, postBarterFeeInr: 0, rtoCostInr: 0, shippingInr: 0, packagingInr: 0,
      platformToolsInr: 0, operatingExpensesInr: 0,
      profitPoolInr: 0, devshopShareInr: 0, founderShareInr: 0,
    }
  );
  return { months, quarterTotals };
}
