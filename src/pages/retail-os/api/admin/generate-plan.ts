export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { generateBusinessPlan, computePlanFromDrivers, BUSINESS_PLAN_PROMPT_VERSION } from '../../../../lib/retail-os-business-plan';

// Gated by src/middleware.ts ('/retail-os/api/admin' is a protected prefix).
export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string; extraNotes?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const id = (body.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 503);

  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Application not found' }, 404);

  try {
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
      env.ANTHROPIC_API_KEY
    );

    // DevShop's split % — midpoint of the stored indicative range. The
    // AI-Enabler track has no profit-pool split at all (its economics run
    // on brand-IP equity — see the Partnership Agreement draft §4), so 0%.
    const splitPct = app.ai_enabler_track
      ? 0
      : app.split_range_lo != null && app.split_range_hi != null
        ? (app.split_range_lo + app.split_range_hi) / 2
        : 37.5;

    // Pay with a Post's fee is DevShop's own platform fee (1% of realised
    // revenue when opted in), not something to research — set deterministically
    // here rather than asked of the model. Treated like a payment gateway charge.
    const postBarterFeePct = app.post_ack ? 1 : 0;
    const postBarterRationale = app.post_ack
      ? "DevShop's Pay with a Post platform fee — 1% of realised revenue, applied like a payment gateway charge."
      : 'Not opted into Pay with a Post — no fee applies.';

    const drivers = {
      ...output.drivers,
      postBarterFeePct,
      rationale: { ...output.driverRationale, postBarter: postBarterRationale },
    };
    const { months, quarterTotals } = computePlanFromDrivers(drivers, splitPct);

    const planId = await db.saveBusinessPlan({
      application_id: id,
      model: 'claude-sonnet-5',
      prompt_version: BUSINESS_PLAN_PROMPT_VERSION,
      research_notes: (body.extraNotes || '').trim(),
      assumptions: output.assumptions,
      drivers,
      months,
      city_breakdown: output.cityBreakdown,
      risks: output.risks,
      sources_cited: output.sourcesCited,
      quarter_totals: quarterTotals,
    });

    return json({ id: planId }, 201);
  } catch (err) {
    console.error('retail-os generate-plan failed', err);
    return json({ error: err instanceof Error ? err.message : 'Plan generation failed' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
