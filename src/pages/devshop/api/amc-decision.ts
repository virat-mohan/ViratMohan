export const prerender = false;
// Admin-only — protected by src/middleware.ts.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';

type Body = {
  id: string;
  mode: 'approved' | 'adjusted' | 'custom';
  monthly_amount_inr: number;
  rationale: string;
};

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.id || !body.mode || !body.monthly_amount_inr) {
    return json({ error: 'id, mode, and monthly_amount_inr are required' }, 400);
  }
  // Adjusting away from the calculated recommendation, or a fully custom
  // number, must always carry a rationale — this is the human-override
  // audit trail the brief calls for, not a silent number swap.
  if (body.mode !== 'approved' && !body.rationale?.trim()) {
    return json({ error: 'rationale is required when adjusting or setting a custom price' }, 400);
  }

  const db = getDb(env);
  try {
    await db.saveAmcPricingDecision(body.id, {
      mode: body.mode,
      monthly_amount_inr: body.monthly_amount_inr,
      rationale: body.rationale?.trim() || 'Approved as calculated.',
      decided_at: new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
