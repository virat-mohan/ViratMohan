export const prerender = false;

import type { APIRoute } from 'astro';
import { withCronAlert } from '../../../lib/cron-alert';
import { getEnv } from '../../../lib/env';
import { serviceDb } from '../../../lib/ledger';
import { json } from '../../../lib/retail-os-http';
import { syncViratSocial, ensureWeeklyBrief } from '../../../lib/virat-social-db';

// Virat's personal Instagram: at 08:15 IST (vercel.json, 02:45 UTC) pulls the last 35 days
// of posts and insights for @viratemn and @vmviews, plus follower mix, then writes the
// week's reel brief on the first run of each week. Read-only; never touches ads.
export const GET: APIRoute = withCronAlert('virat-social', async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  if (!env.META_VIRAT_SOCIAL_TOKEN) return json({ error: 'META_VIRAT_SOCIAL_TOKEN is not set in Vercel' }, 503);
  const db = serviceDb(env);
  const sync = await syncViratSocial(db, env.META_VIRAT_SOCIAL_TOKEN);
  const brief = await ensureWeeklyBrief(db);
  const failed = sync.results.filter((r) => r.error);
  return json({ ...sync, brief: brief.weekStart }, failed.length === sync.results.length ? 502 : 200);
});
