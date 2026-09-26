export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { getOpsDb } from '../../../../../lib/retail-os-ops';
import { json, readJson } from '../../../../../lib/retail-os-http';
import { sendEmail } from '../../../../../lib/email';
import { renderRetailOsEmail } from '../../../../../lib/retail-os-email';
import { getOrigin } from '../../../../../lib/http';

// Daily update or a question from a team member. Questions are also emailed
// to the founder so nothing waits on someone opening the console.
export const POST: APIRoute = async ({ params, request }) => {
  const token = params.token;
  const body = await readJson<{ kind?: string; body?: string }>(request);
  const text = (body?.body || '').trim().slice(0, 4000);
  const kind = body?.kind === 'query' ? 'query' : 'daily';
  if (!token || !text) return json({ error: 'Write something first.' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const db = getOpsDb(env);
  const member = await db.memberByToken(token);
  if (!member) return json({ error: 'Not found' }, 404);

  await db.addLog(member.id, kind, text);

  if (kind === 'query' && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && env.ADMIN_NOTIFY_EMAIL) {
    sendEmail(
      {
        to: env.ADMIN_NOTIFY_EMAIL,
        subject: `Question from ${member.name}`,
        html: renderRetailOsEmail({
          preheader: text.slice(0, 90),
          eyebrow: 'Team',
          heading: `${member.name} asked`,
          lines: [text],
          cta: { label: 'Open the console', url: `${getOrigin(request)}/retail-os/admin/console` },
        }),
        replyTo: member.email,
      },
      env
    ).catch((err) => console.error('ops query email failed', err));
  }
  return json({ ok: true }, 200);
};
