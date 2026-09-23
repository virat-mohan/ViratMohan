import type { RetailOsApplication } from './retail-os-db';
import { getRetailOsDb } from './retail-os-db';
import { generateBusinessPlan, computePlanFromDrivers, BUSINESS_PLAN_PROMPT_VERSION } from './retail-os-business-plan';
import { generateDesignDirection, DESIGN_DIRECTION_PROMPT_VERSION } from './retail-os-design-direction';

type Db = ReturnType<typeof getRetailOsDb>;

// DevShop's split % — midpoint of the stored indicative range, or the final
// % once terms have been sent. The AI-Enabler track has no profit-pool split
// (its economics run on brand-IP equity), so 0%.
export function splitPctFor(app: RetailOsApplication): number {
  if (app.ai_enabler_track) return 0;
  if (app.terms?.splitPct != null) return app.terms.splitPct;
  if (app.split_range_lo != null && app.split_range_hi != null) return (app.split_range_lo + app.split_range_hi) / 2;
  return 37.5;
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

  const drivers = {
    ...output.drivers,
    postBarterFeePct,
    rationale: { ...output.driverRationale, postBarter: postBarterRationale },
  };
  const { months, quarterTotals } = computePlanFromDrivers(drivers, splitPctFor(app));

  return db.saveBusinessPlan({
    application_id: app.id,
    model: 'claude-sonnet-5',
    prompt_version: BUSINESS_PLAN_PROMPT_VERSION,
    research_notes: extraNotes.trim(),
    assumptions: output.assumptions,
    drivers,
    months,
    city_breakdown: output.cityBreakdown,
    risks: output.risks,
    sources_cited: output.sourcesCited,
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
    name: String(r.name ?? ''),
    url: /^https?:\/\//i.test(String(r.url ?? '')) ? String(r.url) : '',
    note: String(r.note ?? ''),
  });
  const cleanHex = (h: string) => (/^#[0-9a-fA-F]{3,8}$/.test(String(h ?? '')) ? String(h) : '#CCCCCC');
  const p = output.colorPalette;

  return db.saveDesignDirection({
    application_id: app.id,
    model: 'claude-sonnet-5',
    prompt_version: DESIGN_DIRECTION_PROMPT_VERSION,
    has_existing_site: output.hasExistingSite,
    primary_reference: cleanRef(output.primaryReference),
    additional_references: (output.additionalReferences ?? []).map(cleanRef),
    color_palette: {
      primaryHex: cleanHex(p.primaryHex), secondaryHex: cleanHex(p.secondaryHex), accentHex: cleanHex(p.accentHex),
      backgroundHex: cleanHex(p.backgroundHex), textHex: cleanHex(p.textHex), rationale: String(p.rationale ?? ''),
    },
    typography: output.typography,
    ux_principles: output.uxPrinciples,
    tone_of_voice: output.toneOfVoice,
  });
}
