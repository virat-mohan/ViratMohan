export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../../lib/env';
import { json } from '../../../../../../lib/retail-os-http';
import { buildPlan, getLead, leadSb } from '../../../../../../lib/lead-audit-db';

// Admin (Basic Auth via middleware): run the audit on the lead's snapshots, write the plan,
// and draft the cover email for approval. Stage -> plan_ready.
export const POST: APIRoute = async ({ params }) => {
  const env = getEnv();
  if (!env.LEAD_TOKEN_SECRET) return json({ error: 'LEAD_TOKEN_SECRET is not set' }, 503);
  const sb = leadSb(env);
  const lead = await getLead(sb, params.id ?? '');
  if (!lead) return json({ error: 'Not found' }, 404);
  try {
    const res = await buildPlan(env, sb, lead);
    return json({ ok: true, stage: 'plan_ready', link: res.link, messageId: res.messageId, gaps: res.plan.gaps, goal: res.plan.goal, writtenBy: res.plan.writtenBy }, 200);
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
};
