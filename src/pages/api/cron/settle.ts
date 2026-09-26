export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { runSettlement } from '../../../lib/settle-run';
import { json } from '../../../lib/retail-os-http';

// Vercel Cron, Monday 06:30 UTC (12:00 IST): every brand's statement and money
// before 1 PM IST. Idempotent: re-running the same Monday never pays twice.
// PAYOUTS_ENABLED defaults to false (dry run: Virat gets a "would pay" email).
export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Database is not configured' }, 503);
  if (env.PAYOUTS_ENABLED === 'true' && (!env.RAZORPAYX_KEY_ID || !env.RAZORPAYX_KEY_SECRET || !env.RAZORPAYX_ACCOUNT_NUMBER)) {
    return json({ error: 'PAYOUTS_ENABLED is on but RazorpayX is not configured' }, 503);
  }
  try {
    return json(await runSettlement(env), 200);
  } catch (err) {
    console.error('settlement run failed', err);
    return json({ error: 'Settlement run failed' }, 500);
  }
};
