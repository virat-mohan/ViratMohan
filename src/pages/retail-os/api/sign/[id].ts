export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { buildTermLines } from '../../../../lib/retail-os-terms';
import { json, escapeHtml, clientIp, readJson } from '../../../../lib/retail-os-http';

// The founder accepts their commercial terms by typing their full legal name.
// The exact terms shown, the name, time, IP address and browser are frozen
// into the signature record. Signing is one-time.
export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return json({ error: 'Missing id' }, 400);
  const body = await readJson<{ signedName?: string; accept?: boolean }>(request);
  const signedName = (body?.signedName || '').trim().slice(0, 120);
  if (!signedName || signedName.length < 3) return json({ error: 'Type your full legal name to sign.' }, 400);
  if (body?.accept !== true) return json({ error: 'Tick the box to accept the terms.' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Not found' }, 404);
  if (!app.terms) return json({ error: 'Your terms are not ready to sign yet.' }, 409);
  if (app.agreement) return json({ error: 'These terms are already signed.' }, 409);

  const lines = buildTermLines(app, app.terms);
  const signedAt = new Date().toISOString();
  const ok = await db.signAgreement(id, {
    signedName,
    signedAt,
    ip: clientIp(request),
    userAgent: (request.headers.get('user-agent') || '').slice(0, 400) || null,
    terms: { ...app.terms, lines },
  });
  if (!ok) return json({ error: 'These terms are already signed.' }, 409);

  const trackUrl = `${getOrigin(request)}/retail-os/track/${id}`;
  const termsHtml = `<table cellpadding="6" style="border-collapse:collapse;font-size:14px;">${lines
    .map((l) => `<tr><td style="vertical-align:top;font-weight:bold;padding-right:12px;">${escapeHtml(l.label)}</td><td>${escapeHtml(l.value)}</td></tr>`)
    .join('')}</table>`;
  const when = new Date(signedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    sendEmail(
      {
        to: app.founder_email,
        subject: `${app.brand_name} — your signed DevShop Retail OS terms`,
        html: `<p>Hi ${escapeHtml(app.founder_name)},</p><p>Thank you for signing. Here is a copy of the terms you accepted on ${escapeHtml(when)} IST as <b>${escapeHtml(signedName)}</b>:</p>${termsHtml}<p>Next step: the ₹5,000 deposit, on your page:</p><p><a href="${trackUrl}">${trackUrl}</a></p><p>— Virat</p>`,
      },
      env
    ).catch((err) => console.error('retail-os sign founder email failed', err));
    if (env.ADMIN_NOTIFY_EMAIL) {
      sendEmail(
        {
          to: env.ADMIN_NOTIFY_EMAIL,
          subject: `Signed: ${app.brand_name} accepted their Retail OS terms`,
          html: `<p><b>${escapeHtml(app.brand_name)}</b> signed as ${escapeHtml(signedName)} on ${escapeHtml(when)} IST.</p>${termsHtml}<p><a href="${getOrigin(request)}/retail-os/admin">Admin →</a></p>`,
          replyTo: app.founder_email,
        },
        env
      ).catch((err) => console.error('retail-os sign admin email failed', err));
    }
  }

  return json({ ok: true }, 200);
};
