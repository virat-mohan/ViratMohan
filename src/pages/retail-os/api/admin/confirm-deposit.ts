export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb, BUILD_WINDOW_DAYS } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { json, escapeHtml, readJson } from '../../../../lib/retail-os-http';

// Gated by src/middleware.ts. Confirms the founder's UPI deposit against the
// bank statement and starts the 7-day build clock.
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ id?: string }>(request);
  const id = (body?.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const env = getEnv();
  const db = getRetailOsDb(env);
  const app = await db.confirmDeposit(id);
  if (!app) return json({ error: 'No deposit reported for this application' }, 404);

  const start = new Date(app.build_started_at ?? Date.now());
  const target = new Date(start.getTime() + BUILD_WINDOW_DAYS * 86400000);
  const targetText = target.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    const trackUrl = `${getOrigin(request)}/retail-os/track/${id}`;
    sendEmail(
      {
        to: app.founder_email,
        subject: `${app.brand_name} — deposit received, your build has started`,
        html: `<p>Hi ${escapeHtml(app.founder_name)},</p><p>Your ₹5,000 deposit is confirmed and the build has started. Target go-live: <b>${escapeHtml(targetText)}</b>.</p><p>The fastest way to hit that date is to answer the setup questions on your page as they open:</p><p><a href="${trackUrl}">${trackUrl}</a></p><p>— Virat</p>`,
      },
      env
    ).catch((err) => console.error('retail-os confirm-deposit email failed', err));
  }
  return json({ ok: true }, 200);
};
