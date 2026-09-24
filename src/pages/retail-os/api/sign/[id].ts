export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { buildTermLines } from '../../../../lib/retail-os-terms';
import { json, clientIp, readJson } from '../../../../lib/retail-os-http';
import { renderRetailOsEmail } from '../../../../lib/retail-os-email';

// The founder accepts their commercial terms by typing their full legal name.
// The exact terms shown, the name, time, IP address and browser are frozen
// into the signature record. Signing is one-time.
export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return json({ error: 'Missing id' }, 400);
  const body = await readJson<{ signedName?: string; accept?: boolean; portfolioConsent?: boolean }>(request);
  const signedName = (body?.signedName || '').trim().slice(0, 120);
  if (!signedName || signedName.length < 3) return json({ error: 'Type your full legal name to sign.' }, 400);
  if (body?.accept !== true) return json({ error: 'Tick the box to accept the terms.' }, 400);
  if (body?.portfolioConsent !== true) return json({ error: 'Tick the portfolio and marketing consent box to sign.' }, 400);

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
    portfolioConsent: true,
    terms: { ...app.terms, lines },
  });
  if (!ok) return json({ error: 'These terms are already signed.' }, 409);

  const trackUrl = `${getOrigin(request)}/retail-os/track/${id}`;
  const when = new Date(signedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    sendEmail(
      {
        to: app.founder_email,
        subject: `${app.brand_name}: signed. Next, the deposit`,
        html: renderRetailOsEmail({
          preheader: 'Pay the ₹5,000 deposit to start your 7-day build.',
          eyebrow: 'Signed',
          heading: 'Next: the deposit',
          lines: [`Thank you. Your terms were signed on ${when} IST as ${signedName}; a copy is below and on your page.`, 'Pay the ₹5,000 deposit on your page, fully adjusted against your tech costs. Your 7-day build starts once it is confirmed.'],
          cta: { label: 'Pay the deposit', url: trackUrl },
          rows: lines,
        }),
      },
      env
    ).catch((err) => console.error('retail-os sign founder email failed', err));
    if (env.ADMIN_NOTIFY_EMAIL) {
      sendEmail(
        {
          to: env.ADMIN_NOTIFY_EMAIL,
          subject: `Signed: ${app.brand_name}`,
          html: renderRetailOsEmail({
            preheader: `${app.brand_name} accepted their terms.`,
            eyebrow: 'FYI',
            heading: `${app.brand_name} signed`,
            lines: [`Signed as ${signedName} on ${when} IST. Next, they pay the deposit; you'll get an email when they report it.`],
            cta: { label: 'Open in admin', url: `${getOrigin(request)}/retail-os/admin` },
          }),
          replyTo: app.founder_email,
        },
        env
      ).catch((err) => console.error('retail-os sign admin email failed', err));
    }
  }

  return json({ ok: true }, 200);
};
