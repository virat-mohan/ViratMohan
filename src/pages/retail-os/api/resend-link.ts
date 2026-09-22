export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../lib/retail-os-db';
import { getEnv } from '../../../lib/env';
import { sendEmail } from '../../../lib/email';
import { getOrigin } from '../../../lib/http';

// Public, deliberately vague response either way (never confirms/denies
// whether an email has an application on file) — same shape as a password-
// reset endpoint, to avoid leaking who has applied.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const origin = getOrigin(request);

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const email = (body.email || '').trim();
  if (!email) return json({ error: 'email is required' }, 400);

  try {
    const db = getRetailOsDb(env);
    const app = await db.findLatestByEmail(email);
    if (app && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
      const trackUrl = `${origin}/retail-os/track/${app.id}`;
      await sendEmail(
        {
          to: app.founder_email,
          subject: `${app.brand_name} — your DevShop Retail OS status link`,
          html: `<p>Hi ${escapeHtml(app.founder_name)},</p>
<p>Here's your status link for <b>${escapeHtml(app.brand_name)}</b>:</p>
<p><a href="${trackUrl}">${trackUrl}</a></p>
<p>— Virat</p>`,
        },
        env
      );
    }
  } catch (err) {
    console.error('retail-os resend-link failed', err);
    // Still return ok below — never reveal lookup failures to the caller.
  }

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
