export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb, DEPOSIT_INR, BUILD_WINDOW_DAYS } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { renderRetailOsEmail } from '../../../../lib/retail-os-email';
import { json, escapeHtml, readJson } from '../../../../lib/retail-os-http';

// Gated by src/middleware.ts. For a deposit collected in person (cash, UPI
// shown on Virat's own phone, etc.) — records and confirms it in one step, so
// the 7-day build starts immediately without waiting on the founder to come
// back and type a UTR into their own page first.
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ id?: string; reference?: string }>(request);
  const id = (body?.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const env = getEnv();
  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Application not found' }, 404);
  if (!app.agreement) return json({ error: 'Sign terms before recording the deposit.' }, 409);
  if (app.deposit?.confirmedAt) return json({ error: 'Deposit is already confirmed.' }, 409);

  const reference = (body?.reference || 'Collected in person by Virat').trim().slice(0, 120);
  const now = new Date().toISOString();
  await db.submitDeposit(id, { amountInr: DEPOSIT_INR, utr: reference, submittedAt: now, confirmedAt: null });
  const confirmed = await db.confirmDeposit(id);
  if (!confirmed) return json({ error: 'Could not confirm the deposit. Try again.' }, 500);

  const start = new Date(confirmed.build_started_at ?? Date.now());
  const target = new Date(start.getTime() + BUILD_WINDOW_DAYS * 86400000);
  const targetText = target.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
    const trackUrl = `${getOrigin(request)}/retail-os/track/${id}`;
    sendEmail(
      {
        to: app.founder_email,
        subject: `${app.brand_name}: your build has started`,
        html: renderRetailOsEmail({
          preheader: `Target go-live: ${targetText}.`,
          eyebrow: 'Build started',
          heading: `Live by ${targetText}`,
          lines: ['Your deposit is confirmed and your 7-day build has started.', 'The setup questions on your page open one at a time. Answering them quickly is what keeps us on that date.'],
          cta: { label: 'Answer the first questions', url: trackUrl },
        }),
      },
      env
    ).catch((err) => console.error('retail-os mark-deposit-paid founder email failed', err));
  }

  return json({ ok: true, targetText: escapeHtml(targetText) }, 200);
};
