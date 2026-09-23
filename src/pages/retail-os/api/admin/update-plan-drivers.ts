export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { computePlanFromDrivers } from '../../../../lib/retail-os-business-plan';

// Gated by src/middleware.ts. A human edits a driver here; this recomputes
// months/quarter_totals from the SAME formula the LLM-generated plan used
// (computePlanFromDrivers) and overwrites the plan row in place — no new
// version, the formulas stay live.
export const POST: APIRoute = async ({ request }) => {
  let body: {
    planId?: string; applicationId?: string; ordersM1?: number; ordersM2?: number; ordersM3?: number;
    aovInr?: number; cogsPct?: number; cacPct?: number; adminTechPct?: number;
    codOrderSharePct?: number; paymentGatewayFeePct?: number; codHandlingFeePct?: number; postBarterFeePct?: number;
    rtoRatePct?: number; rtoCostPerOrderInr?: number; shippingCostPerOrderInr?: number; packagingCostPerOrderInr?: number;
    platformToolsFixedInrPerMonth?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const planId = (body.planId || '').trim();
  const applicationId = (body.applicationId || '').trim();
  if (!planId || !applicationId) return json({ error: 'planId and applicationId are required' }, 400);

  const env = getEnv();
  const db = getRetailOsDb(env);
  const [plan, app] = await Promise.all([db.getBusinessPlanById(planId), db.getById(applicationId)]);
  if (!plan) return json({ error: 'Plan not found' }, 404);
  if (!app) return json({ error: 'Application not found' }, 404);

  const drivers = {
    ordersM1: Number(body.ordersM1) || 0,
    ordersM2: Number(body.ordersM2) || 0,
    ordersM3: Number(body.ordersM3) || 0,
    aovInr: Number(body.aovInr) || 0,
    cogsPct: Number(body.cogsPct) || 0,
    cacPct: Number(body.cacPct) || 0,
    adminTechPct: Number(body.adminTechPct) || 0,
    codOrderSharePct: Number(body.codOrderSharePct) || 0,
    paymentGatewayFeePct: Number(body.paymentGatewayFeePct) || 0,
    codHandlingFeePct: Number(body.codHandlingFeePct) || 0,
    postBarterFeePct: Number(body.postBarterFeePct) || 0,
    rtoRatePct: Number(body.rtoRatePct) || 0,
    rtoCostPerOrderInr: Number(body.rtoCostPerOrderInr) || 0,
    shippingCostPerOrderInr: Number(body.shippingCostPerOrderInr) || 0,
    packagingCostPerOrderInr: Number(body.packagingCostPerOrderInr) || 0,
    platformToolsFixedInrPerMonth: Number(body.platformToolsFixedInrPerMonth) || 0,
    rationale: plan.drivers.rationale, // rationale text is untouched by a numeric edit
  };

  const splitPct = app.ai_enabler_track
    ? 0
    : app.split_range_lo != null && app.split_range_hi != null
      ? (app.split_range_lo + app.split_range_hi) / 2
      : 37.5;

  try {
    const { months, quarterTotals } = computePlanFromDrivers(drivers, splitPct);
    await db.updatePlanDrivers(planId, drivers, months, quarterTotals);
    return json({ ok: true }, 200);
  } catch (err) {
    console.error('retail-os update-plan-drivers failed', err);
    return json({ error: 'Update failed' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
