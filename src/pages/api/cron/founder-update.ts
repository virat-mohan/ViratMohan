export const prerender = false;

import type { APIRoute } from 'astro';
import { withCronAlert } from '../../../lib/cron-alert';
import { getEnv } from '../../../lib/env';
import { sendEmail } from '../../../lib/email';
import { mailConfigured } from '../../../lib/mail/send';
import { json } from '../../../lib/retail-os-http';
import { istToday } from '../../../lib/retail-os-portfolio';
import { listActiveSubs, buildFounderUpdate } from '../../../lib/retail-os-daily-update';

// Daily Founder Update: every subscribed brand's founder gets one email a day
// (what I did, why it matters, last-24h numbers), from the day they sign.
// Recipients: retail_os_founder_update_subs. ?dry=1 returns the HTML instead of
// sending. Scheduled in vercel.json.
export const GET: APIRoute = withCronAlert('founder-update', async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);

  const today = istToday();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const subs = await listActiveSubs(env);
  const built = await Promise.all(subs.map((s) => buildFounderUpdate(env, s, since, today)));

  if (new URL(request.url).searchParams.get('dry') === '1') {
    return new Response(built.map((b) => b.html).join('<hr style="margin:40px 0;">'), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (!mailConfigured(env)) return json({ error: 'Email is not configured' }, 503);

  const results: { brand: string; to: string; sent: boolean }[] = [];
  for (const b of built) {
    try {
      await sendEmail({ to: b.to, subject: b.subject, html: b.html }, env);
      results.push({ brand: b.brand_key, to: b.to, sent: true });
    } catch (err) {
      console.error('founder update failed', b.brand_key, err);
      results.push({ brand: b.brand_key, to: b.to, sent: false });
    }
  }
  const failures = results.filter((r) => !r.sent).map((r) => r.brand);
  return json({ today, count: results.length, sent: results.filter((r) => r.sent).length, failures, results }, failures.length ? 500 : 200);
});
