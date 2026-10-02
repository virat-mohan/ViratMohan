export const prerender = false;

import type { APIRoute } from 'astro';
import { withCronAlert } from '../../../lib/cron-alert';
import { getEnv } from '../../../lib/env';
import { serviceDb } from '../../../lib/ledger';
import { json } from '../../../lib/retail-os-http';
import { briefLines, sendToFounder } from '../../../lib/founder-line';
import { liveFounderSend, loadFounderSnapshot } from '../../../lib/founder-line-db';

// Myoho's 8pm founder brief on WhatsApp (vercel.json: 14:30 UTC = 20:00 IST) to 919999277240.
// Free text inside 24h of Virat's last message, else the founder_daily_brief template once
// approved (FOUNDER_BRIEF_TEMPLATE_APPROVED=1). Logged to whatsapp_messages, sent_by 'founder_brief'.
// ?dry=1 returns the text without sending.
export const GET: APIRoute = withCronAlert('founder-brief', async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const sb = serviceDb(env);
  const snap = await loadFounderSnapshot(env, sb);
  const text = briefLines(snap).join('\n');
  if (new URL(request.url).searchParams.get('dry') === '1') return json({ text }, 200);
  const how = await sendToFounder(text, snap.date, liveFounderSend(env, sb, 'founder_brief'));
  return json({ sent: how !== 'skipped', how }, 200);
});
