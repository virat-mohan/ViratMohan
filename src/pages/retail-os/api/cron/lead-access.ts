export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json } from '../../../../lib/retail-os-http';
import { leadSb, refreshConnectors, remindStalled } from '../../../../lib/lead-audit-db';

// Daily (vercel.json). Drafts a reminder for leads whose access has stalled 48h (for Virat's approval,
// send_after inside 9am-8pm IST), and on Mondays refreshes verified connectors.
export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  if (!env.LEAD_TOKEN_SECRET) return json({ error: 'LEAD_TOKEN_SECRET is not set' }, 503);
  const sb = leadSb(env);
  const reminded = await remindStalled(env, sb);
  const refreshed = new Date().getUTCDay() === 1 ? await refreshConnectors(env, sb) : 0;
  return json({ ok: true, reminded, refreshed }, 200);
};
