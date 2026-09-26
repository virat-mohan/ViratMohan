export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { serviceDb } from '../../../lib/ledger';
import { flushOutbox } from '../../../lib/notify';
import { json } from '../../../lib/retail-os-http';

// Sends messages that waited for decent hours (9am–8pm IST, Mon–Sat).
export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  try {
    return json(await flushOutbox(env, serviceDb(env)), 200);
  } catch (err) {
    console.error('outbox flush failed', err);
    return json({ error: 'Outbox flush failed' }, 500);
  }
};
