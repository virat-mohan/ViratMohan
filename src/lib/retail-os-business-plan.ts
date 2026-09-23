// Quarterly business-plan / benchmark P&L generator for DevShop Retail OS
// applications. Mirrors the call pattern in src/lib/llm.ts (direct fetch,
// forced tool_choice for structured output) rather than importing that
// file, because the system prompt and schema here are purpose-built and
// have nothing to do with the classify+build pipeline.
//
// DELIBERATE DESIGN CHOICE: this is a two-stage flow, not one LLM call that
// "does research." Stage 1 is a human (the admin) supplying real market
// research — industry sizing, city-level consumer spend, category
// benchmarks, competitor pricing, customer behaviour — with sources, via
// the admin UI. Stage 2 (this file) is Claude SYNTHESIZING that supplied
// research plus the brand's own intake data into a structured plan. The
// model is explicitly forbidden from inventing a number with no basis in
// what it was given — see the system prompt below. This avoids the two
// realistic failure modes of "just ask the LLM for a business plan":
// confidently invented statistics, and no way to trace a number back to
// where it came from.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 8000;
export const BUSINESS_PLAN_PROMPT_VERSION = '2026-09-23.1';
const CLAUDE_TIMEOUT_MS = 120_000;

export type PlanAssumption = { label: string; value: string; rationale: string; basis: 'supplied_research' | 'brand_data' | 'industry_benchmark_general_knowledge' };
export type PlanMonth = {
  label: string;
  orders: number;
  revenueInr: number;
  cogsInr: number;
  cacInr: number;
  adminTechInr: number;
  rationale: string;
  // Computed server-side after the call, never by the model — see computeShares().
  profitPoolInr?: number;
  devshopShareInr?: number;
  founderShareInr?: number;
};
export type PlanCity = { city: string; revenueSharePct: number; rationale: string };

export type BusinessPlanOutput = {
  assumptions: PlanAssumption[];
  months: PlanMonth[];
  cityBreakdown: PlanCity[];
  risks: string[];
  sourcesCited: string[];
};

const PLAN_TOOL = {
  name: 'quarterly_business_plan',
  description: 'A grounded 3-month benchmark P&L for a D2C brand, with a cited rationale for every assumption.',
  input_schema: {
    type: 'object',
    properties: {
      assumptions: {
        type: 'array',
        description: 'Every material assumption behind the plan — AOV, orders/month, COGS%, CAC%, admin/tech%, etc. One entry per assumption.',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string' },
            rationale: { type: 'string', description: 'Why this number — must reference the supplied research or brand data it comes from.' },
            basis: { type: 'string', enum: ['supplied_research', 'brand_data', 'industry_benchmark_general_knowledge'] },
          },
          required: ['label', 'value', 'rationale', 'basis'],
        },
      },
      months: {
        type: 'array', minItems: 3, maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'e.g. "Month 1"' },
            orders: { type: 'number' },
            revenueInr: { type: 'number' },
            cogsInr: { type: 'number' },
            cacInr: { type: 'number' },
            adminTechInr: { type: 'number' },
            rationale: { type: 'string' },
          },
          required: ['label', 'orders', 'revenueInr', 'cogsInr', 'cacInr', 'adminTechInr', 'rationale'],
        },
      },
      cityBreakdown: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            revenueSharePct: { type: 'number' },
            rationale: { type: 'string' },
          },
          required: ['city', 'revenueSharePct', 'rationale'],
        },
      },
      risks: { type: 'array', items: { type: 'string' }, description: 'What could make actuals miss this plan, in plain language.' },
      sourcesCited: { type: 'array', items: { type: 'string' }, description: 'Which of the supplied research sources were actually used, by name.' },
    },
    required: ['assumptions', 'months', 'cityBreakdown', 'risks', 'sourcesCited'],
  },
} as const;

const SYSTEM_PROMPT = `You are a senior D2C e-commerce financial analyst building a quarterly business plan and benchmark P&L for one brand on DevShop Retail OS.

You will be given (1) the brand's own intake data, and (2) market research notes supplied by the operator — industry sizing, city-level consumer spend, category price benchmarks, competitor pricing, customer behaviour, or sales data, each ideally with a source.

Hard rules:
- Ground every numeric assumption in the supplied research or the brand's own data. Never invent a precise statistic with no basis.
- Where the supplied research doesn't cover something you need, say so explicitly in that assumption's rationale ("no research supplied on X — using a general industry benchmark") and mark basis as "industry_benchmark_general_knowledge" rather than passing it off as researched.
- Build monthly revenue bottom-up: orders per month × average order value, broken down by target city where the research supports it, not a single top-down guess.
- Use conservative, defensible estimates appropriate for an early-stage or scaling D2C brand — not best-case numbers.
- COGS%, CAC%, and admin/tech% should reflect the category and city mix given, not a generic 25/25/10 default unless the research or brand data actually supports that split for this brand.
- Every assumption needs a rationale a skeptical founder would accept, in one or two sentences.

Output only through the quarterly_business_plan tool.`;

function buildUserMessage(app: BrandContext, researchNotes: string): string {
  return `BRAND INTAKE DATA
Brand: ${app.brandName}
Category: ${app.category ?? 'not specified'}
Format: ${app.format ?? 'not specified'}
Existing revenue: ${app.hasRevenue === 'yes' ? (app.revenueRange ?? 'yes, range not specified') : 'none — pre-revenue'}
Following: ${app.following ?? 'not specified'}
Catalog size: ${app.productCount ?? 'not specified'}
Target cities (brand-supplied): ${app.targetCities ?? 'not specified'}
Payment methods: ${app.paymentMethods ?? 'not specified'}
Shipping model: ${app.shippingChargeModel ?? 'not specified'}
Return window: ${app.returnWindow ?? 'not specified'}

SUPPLIED MARKET RESEARCH (ground every assumption in this where it applies)
${researchNotes}

Build the 3-month benchmark P&L now.`;
}

export type BrandContext = {
  brandName: string;
  category: string | null;
  format: string | null;
  hasRevenue: string | null;
  revenueRange: string | null;
  following: string | null;
  productCount: string | null;
  targetCities: string | null;
  paymentMethods: string | null;
  shippingChargeModel: string | null;
  returnWindow: string | null;
};

export async function generateBusinessPlan(
  app: BrandContext,
  researchNotes: string,
  apiKey: string
): Promise<BusinessPlanOutput> {
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
        messages: [{ role: 'user', content: buildUserMessage(app, researchNotes) }],
        tools: [PLAN_TOOL],
        tool_choice: { type: 'tool', name: PLAN_TOOL.name },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as { content: Array<{ type: string; input?: Record<string, unknown> }> };
    const toolUse = data.content.find((b) => b.type === 'tool_use');
    if (!toolUse?.input) throw new Error('Anthropic response did not include a tool_use block');
    return toolUse.input as unknown as BusinessPlanOutput;
  } finally {
    clearTimeout(timeout);
  }
}

// Deterministic — never trust the model's own arithmetic for money that
// feeds a real settlement comparison. splitPct is DevShop's share of the
// profit pool (e.g. from the application's stored split_range midpoint).
export function computeShares(months: PlanMonth[], splitPct: number): PlanMonth[] {
  return months.map((m) => {
    const profitPoolInr = m.revenueInr - m.cogsInr - m.cacInr - m.adminTechInr;
    const devshopShareInr = Math.round(profitPoolInr * (splitPct / 100));
    return { ...m, profitPoolInr, devshopShareInr, founderShareInr: profitPoolInr - devshopShareInr };
  });
}

export function sumQuarterTotals(months: PlanMonth[]) {
  return months.reduce(
    (acc, m) => ({
      ordersTotal: acc.ordersTotal + m.orders,
      revenueInr: acc.revenueInr + m.revenueInr,
      cogsInr: acc.cogsInr + m.cogsInr,
      cacInr: acc.cacInr + m.cacInr,
      adminTechInr: acc.adminTechInr + m.adminTechInr,
      profitPoolInr: acc.profitPoolInr + (m.profitPoolInr ?? 0),
      devshopShareInr: acc.devshopShareInr + (m.devshopShareInr ?? 0),
      founderShareInr: acc.founderShareInr + (m.founderShareInr ?? 0),
    }),
    { ordersTotal: 0, revenueInr: 0, cogsInr: 0, cacInr: 0, adminTechInr: 0, profitPoolInr: 0, devshopShareInr: 0, founderShareInr: 0 }
  );
}
