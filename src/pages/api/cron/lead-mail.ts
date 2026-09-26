export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { getOrigin } from '../../../lib/http';
import { json } from '../../../lib/retail-os-http';
import { serviceDb } from '../../../lib/ledger';
import { runLeadMail } from '../../../lib/lead-mail/run';
import { liveRunDeps } from '../../../lib/lead-mail/live';
import { SupabaseLeadStore } from '../../../lib/lead-mail/store';

// Every 10 minutes: read new mail in Virat's inbox, log lead messages, draft replies for approval.
export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  const now = new Date();
  const deps = await liveRunDeps(env, getOrigin(request), now);
  if ('error' in deps) return json({ skipped: deps.error }, 200);
  try {
    const result = await runLeadMail(deps);
    await new SupabaseLeadStore(serviceDb(env)).saveState(env.GMAIL_ADDRESS.toLowerCase(), { last_result: result, last_run_at: now.toISOString() }).catch(() => {});
    return json(result, 200);
  } catch (err) {
    console.error('lead-mail run failed', err);
    return json({ error: 'Lead mail run failed' }, 500);
  }
};
