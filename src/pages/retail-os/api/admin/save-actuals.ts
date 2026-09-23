export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';

// Gated by src/middleware.ts. Manual entry — there's no real orders/
// payments feed into this system yet, so "actuals" means the admin typing
// in what actually happened for a month, to compare against the benchmark.
export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string; month?: string; revenueInr?: number; cogsInr?: number; cacInr?: number; adminTechInr?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const id = (body.id || '').trim();
  const month = (body.month || '').trim();
  if (!id || !/^\d{4}-\d{2}$/.test(month)) {
    return json({ error: 'id and month (YYYY-MM) are required' }, 400);
  }

  const env = getEnv();
  const db = getRetailOsDb(env);
  try {
    await db.upsertActual({
      application_id: id,
      month,
      revenue_inr: Number(body.revenueInr) || 0,
      cogs_inr: Number(body.cogsInr) || 0,
      cac_inr: Number(body.cacInr) || 0,
      admin_tech_inr: Number(body.adminTechInr) || 0,
    });
    return json({ ok: true }, 200);
  } catch (err) {
    console.error('retail-os save-actuals failed', err);
    return json({ error: 'Save failed' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
