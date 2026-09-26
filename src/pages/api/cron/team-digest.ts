export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { sendEmail } from '../../../lib/email';
import { mailConfigured } from '../../../lib/mail/send';
import { getOpsDb } from '../../../lib/retail-os-ops';
import { istToday } from '../../../lib/retail-os-portfolio';
import { json } from '../../../lib/retail-os-http';
import { buildMemberDigest, renderTeamDigest } from '../../../lib/team-digest';

// Employee Support Agent: at 09:30 IST (vercel.json, 04:00 UTC) emails Virat
// what every team member did in the last 24 hours. TEAM_DIGEST_TO overrides
// the recipient; ?dry=1 returns the HTML instead of sending.
export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);

  const today = istToday();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const db = getOpsDb(env);
  const members = await db.listMembers();
  const digests = await Promise.all(
    members.map(async (m) => buildMemberDigest(m, await db.listTasks(m.id), await db.listLog(m.id, 200), since, today)),
  );
  const { subject, html } = renderTeamDigest(digests, { today, origin: 'https://www.viratmohan.com' });

  if (new URL(request.url).searchParams.get('dry') === '1') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (!mailConfigured(env)) return json({ error: 'Email is not configured' }, 503);
  const to = process.env.TEAM_DIGEST_TO || 'viratmohan@gmail.com';
  try {
    await sendEmail({ to, subject, html }, env);
    return json({ today, to, members: digests.length, sent: true }, 200);
  } catch (err) {
    console.error('team digest failed', err);
    return json({ error: 'Team digest failed' }, 500);
  }
};
