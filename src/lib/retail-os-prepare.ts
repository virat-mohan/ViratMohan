import type { RetailOsApplication } from './retail-os-db';
import { getRetailOsDb } from './retail-os-db';
import { generateBusinessPlan, computePlanFromDrivers, applyStrategy, STANDARD_SPLIT_PCT, BUSINESS_PLAN_PROMPT_VERSION } from './retail-os-business-plan';
import { generateDesignDirection, DESIGN_DIRECTION_PROMPT_VERSION } from './retail-os-design-direction';

type Db = ReturnType<typeof getRetailOsDb>;

// The split a plan is computed at: the sent/signed terms, else whatever was
// negotiated on the plan, else the 40% standard.
export function planSplitPct(plan: { drivers: { splitPct?: number; lockedByAdmin?: boolean } } | null, app: RetailOsApplication): number {
  if (app.ai_enabler_track) return 0;
  if (app.terms?.splitPct != null) return app.terms.splitPct;
  if (plan?.drivers?.lockedByAdmin && plan.drivers.splitPct != null) return plan.drivers.splitPct;
  return splitPctFor(app);
}

// DevShop's split % — 40% as standard until negotiated (sent terms or an
// edit on the plan). The AI-Enabler track has no profit-pool split (its
// economics run on brand-IP equity), so 0%.
export function splitPctFor(app: RetailOsApplication): number {
  if (app.ai_enabler_track) return 0;
  if (app.terms?.splitPct != null) return app.terms.splitPct;
  return STANDARD_SPLIT_PCT;
}

export async function createPlanForApplication(db: Db, app: RetailOsApplication, apiKey: string, extraNotes = ''): Promise<string> {
  const output = await generateBusinessPlan(
    {
      brandName: app.brand_name,
      category: app.category,
      format: app.format,
      hasRevenue: app.has_revenue,
      revenueRange: app.revenue_range,
      following: app.following,
      productCount: app.product_count,
      targetCities: app.target_cities,
      handle: app.handle,
      shopifyUrl: app.catalog_mode === 'shopify' ? app.shopify_url : null,
      postBarterOptIn: app.post_ack,
    },
    apiKey
  );

  // Pay with a Post's fee is DevShop's own platform fee (1% of realised
  // revenue when opted in), not something to research.
  const postBarterFeePct = app.post_ack ? 1 : 0;
  const postBarterRationale = app.post_ack
    ? "DevShop's Pay with a Post platform fee — 1% of realised revenue, applied like a payment gateway charge."
    : 'Not opted into Pay with a Post — no fee applies.';

  const drivers = applyStrategy({
    ...output.drivers,
    postBarterFeePct,
    rationale: { ...output.driverRationale, postBarter: postBarterRationale },
  });
  const { months, quarterTotals } = computePlanFromDrivers(drivers, splitPctFor(app));

  return db.saveBusinessPlan({
    application_id: app.id,
    model: 'claude-sonnet-5',
    prompt_version: BUSINESS_PLAN_PROMPT_VERSION,
    research_notes: extraNotes.trim(),
    assumptions: output.assumptions ?? [],
    drivers,
    months,
    city_breakdown: output.cityBreakdown ?? [],
    risks: output.risks ?? [],
    sources_cited: output.sourcesCited ?? [],
    quarter_totals: quarterTotals,
  });
}

export async function createDesignForApplication(db: Db, app: RetailOsApplication, apiKey: string): Promise<string> {
  const output = await generateDesignDirection(
    {
      brandName: app.brand_name,
      category: app.category,
      format: app.format,
      handle: app.handle,
      shopifyUrl: app.catalog_mode === 'shopify' ? app.shopify_url : null,
    },
    apiKey
  );

  // Model output is shaped by web-search content and is rendered as link hrefs
  // and inline style values on the partner's tracker — only http(s) URLs and
  // strict hex colours get through.
  const cleanRef = (r: { name: string; url: string; note: string }) => ({
    name: String(r?.name ?? ''),
    url: /^https?:\/\//i.test(String(r?.url ?? '')) ? String(r.url) : '',
    note: String(r?.note ?? ''),
  });
  const cleanHex = (h: string) => (/^#[0-9a-fA-F]{3,8}$/.test(String(h ?? '')) ? String(h) : '#CCCCCC');

  const batchId = crypto.randomUUID();
  const ids: string[] = [];
  for (const [i, o] of output.options.slice(0, 3).entries()) {
    const p = o.colorPalette;
    ids.push(await db.saveDesignDirection({
      application_id: app.id,
      model: 'claude-sonnet-5',
      prompt_version: DESIGN_DIRECTION_PROMPT_VERSION,
      has_existing_site: !!output.hasExistingSite,
      primary_reference: cleanRef(o.primaryReference ?? { name: '', url: '', note: '' }),
      additional_references: (o.additionalReferences ?? []).map(cleanRef),
      color_palette: {
        primaryHex: cleanHex(p?.primaryHex), secondaryHex: cleanHex(p?.secondaryHex), accentHex: cleanHex(p?.accentHex),
        backgroundHex: cleanHex(p?.backgroundHex), textHex: cleanHex(p?.textHex), rationale: String(p?.rationale ?? ''),
      },
      typography: o.typography ?? { headingFont: 'Inter', bodyFont: 'Inter', rationale: '' },
      ux_principles: o.uxPrinciples ?? [],
      tone_of_voice: String(o.toneOfVoice ?? ''),
      batch_id: batchId,
      option_name: String(o.name ?? `Option ${i + 1}`).slice(0, 80),
      option_summary: String(o.summary ?? '').slice(0, 400),
      sort_order: i,
    }));
  }
  return ids[0];
}
