export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { serviceDb } from '../../../../lib/ledger';
import { json } from '../../../../lib/retail-os-http';
import { ensureWeeklyBrief } from '../../../../lib/virat-social-db';
import { briefCalendarSpec } from '../../../../lib/virat-social';

// This week's reel brief as a content & performance calendar spec. Save it to
// tools/calendar/specs/ and render with tools/calendar/render.mjs (the standard).
export const GET: APIRoute = async () => {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const { weekStart, ideas } = await ensureWeeklyBrief(serviceDb(env));
  const spec = briefCalendarSpec(ideas, weekStart);
  return new Response(JSON.stringify(spec, null, 2), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${spec.slug}.json"` } });
};
