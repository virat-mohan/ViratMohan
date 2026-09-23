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
};
export type PlanMonth = {
  label: string; orders: number; revenueInr: number; cogsInr: number; cacInr: number; adminTechInr: number;
  profitPoolInr: number; devshopShareInr: number; founderShareInr: number;
};
export type PlanCity = { city: string; revenueSharePct: number; rationale: string };

export type BusinessPlanOutput = {
  assumptions: PlanAssumption[];
  drivers: PlanDrivers;
  driverRationale: { aov: string; orders: string; cogsPct: string; cacPct: string; adminTechPct: string };
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
        },
        required: ['ordersM1', 'ordersM2', 'ordersM3', 'aovInr', 'cogsPct', 'cacPct', 'adminTechPct'],
      },
      driverRationale: {
        type: 'object',
        description: 'One rationale per driver (or driver group), citing what it is grounded in — this is what a founder will read to trust the number.',
        properties: {
          orders: { type: 'string' },
          aov: { type: 'string' },
          cogsPct: { type: 'string' },
          cacPct: { type: 'string' },
          adminTechPct: { type: 'string' },
        },
        required: ['orders', 'aov', 'cogsPct', 'cacPct', 'adminTechPct'],
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
- Express the plan as DRIVERS, not final totals: orders per month (a realistic ramp across 3 months, not identical numbers), average order value, COGS%, CAC%, admin/tech% of revenue. You are not asked to compute revenue or profit — that happens outside this tool, deterministically, from the drivers you give.
- Use conservative, defensible estimates appropriate for an early-stage or scaling D2C brand — not best-case numbers.
- COGS%, CAC%, and admin/tech% should reflect the actual category and city mix, not a generic default unless research genuinely supports that split for this brand.
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
    const profitPoolInr = revenueInr - cogsInr - cacInr - adminTechInr;
    const devshopShareInr = Math.round(profitPoolInr * (splitPct / 100));
    return {
      label: `Month ${i + 1}`, orders: o, revenueInr, cogsInr, cacInr, adminTechInr,
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
      profitPoolInr: acc.profitPoolInr + m.profitPoolInr,
      devshopShareInr: acc.devshopShareInr + m.devshopShareInr,
      founderShareInr: acc.founderShareInr + m.founderShareInr,
    }),
    { ordersTotal: 0, revenueInr: 0, cogsInr: 0, cacInr: 0, adminTechInr: 0, profitPoolInr: 0, devshopShareInr: 0, founderShareInr: 0 }
  );
  return { months, quarterTotals };
}
