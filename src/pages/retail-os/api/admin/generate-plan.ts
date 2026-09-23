export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { generateBusinessPlan, computeShares, sumQuarterTotals, BUSINESS_PLAN_PROMPT_VERSION } from '../../../../lib/retail-os-business-plan';

// Gated by src/middleware.ts ('/retail-os/api/admin' is a protected prefix).
export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string; researchNotes?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const id = (body.id || '').trim();
  const researchNotes = (body.researchNotes || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);
  if (researchNotes.length < 40) {
    return json({ error: 'Paste real market research first — at least a few sentences with sources. The plan is only as good as what it\'s grounded in.' }, 400);
  }

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
        paymentMethods: app.payment_methods,
        shippingChargeModel: app.shipping_charge_model,
        returnWindow: app.return_window,
      },
      researchNotes,
      env.ANTHROPIC_API_KEY
    );

    // DevShop's split % — midpoint of the stored indicative range, or the
    // standard-track default midpoint if the application never got one
    // (e.g. AI-Enabler track, which has no profit-pool split at all —
    // 0% here since that track's economics run on brand-IP equity, not a
    // Profit Pool cut; see the Partnership Agreement draft §4).
    const splitPct = app.ai_enabler_track
      ? 0
      : app.split_range_lo != null && app.split_range_hi != null
        ? (app.split_range_lo + app.split_range_hi) / 2
        : 37.5;

    const months = computeShares(output.months, splitPct);
    const quarterTotals = sumQuarterTotals(months);

    const planId = await db.saveBusinessPlan({
      application_id: id,
      model: 'claude-sonnet-5',
      prompt_version: BUSINESS_PLAN_PROMPT_VERSION,
      research_notes: researchNotes,
      assumptions: output.assumptions,
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
