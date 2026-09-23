export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { json, escapeHtml, readJson } from '../../../../lib/retail-os-http';

// Gated by src/middleware.ts. Sets the final commercial terms after review and
// emails the founder that they are ready to sign. Terms can be re-sent with a
// change only until the founder has signed.
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ id?: string; splitPct?: number | string; notes?: string }>(request);
  const id = (body?.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const env = getEnv();
  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Application not found' }, 404);
  if (app.agreement) return json({ error: 'Already signed; terms can no longer be changed here.' }, 409);

  let splitPct: number | null = null;
  if (!app.ai_enabler_track) {
    splitPct = Number(body?.splitPct);
    if (!Number.isFinite(splitPct) || splitPct < 1 || splitPct > 90) return json({ error: 'Split must be a percentage between 1 and 90.' }, 400);
    splitPct = Math.round(splitPct * 10) / 10;
  }
  const notes = (body?.notes || '').trim().slice(0, 1500) || null;

  await db.setTerms(id, { splitPct, aiEnabler: app.ai_enabler_track, notes, sentAt: new Date().toISOString() });

  const trackUrl = `${getOrigin(request)}/retail-os/track/${id}`;
  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    sendEmail(
      {
        to: app.founder_email,
        subject: `${app.brand_name} — your DevShop Retail OS terms are ready`,
        html: `<p>Hi ${escapeHtml(app.founder_name)},</p><p>I've reviewed ${escapeHtml(app.brand_name)} and your terms are ready. You can read them and sign on your page:</p><p><a href="${trackUrl}">${trackUrl}</a></p><p>Once signed and the ₹5,000 deposit is in, your store goes live within 7 days.</p><p>— Virat</p>`,
      },
      env
    ).catch((err) => console.error('retail-os send-terms email failed', err));
  }
  return json({ ok: true }, 200);
};
