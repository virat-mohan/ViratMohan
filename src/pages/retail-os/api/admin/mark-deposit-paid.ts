export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb, DEPOSIT_INR, BUILD_WINDOW_DAYS } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { renderRetailOsEmail } from '../../../../lib/retail-os-email';
import { json, escapeHtml, readJson } from '../../../../lib/retail-os-http';
import { mailConfigured } from '../../../../lib/mail/send';

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
  syncLeadFromApplication(db.client, confirmed, 'deposit_paid').catch(() => {});
  seedBrandSetupTasks(db.client, confirmed.brand_name).catch((e) => console.error('ops seed failed', e));

  const start = new Date(confirmed.build_started_at ?? Date.now());
  const target = new Date(start.getTime() + BUILD_WINDOW_DAYS * 86400000);
  const targetText = target.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

  const day = (n: number) => new Date(start.getTime() + n * 86400000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const schedule: [number, number, string, string][] = [
    [0, 0, 'Deposit confirmed', 'Done. Build clock started.'],
    [1, 1, 'Setup questions', 'You: answer each section on your page.'],
    [1, 2, 'Catalog', 'I import or build your products; you confirm prices and stock.'],
    [2, 4, 'Payments', 'I set up the gateway; you share KYC documents when asked.'],
    [2, 3, 'Shipping', 'I wire in the courier; you confirm the pickup address.'],
    [3, 4, 'Meta (Instagram & Facebook)', 'I connect Business Manager, catalog and pixel; you accept the access request.'],
    [3, 5, 'WhatsApp', 'I provision the business number; you approve the display name.'],
    [6, 6, 'Go-live review', 'Together: test order end to end and sign off.'],
    [BUILD_WINDOW_DAYS, BUILD_WINDOW_DAYS, 'Live & selling', 'Store opens and ads start. Weekly settlement every Monday by 1 PM.'],
  ];
  const rows = schedule.map(([a, b, label, what]) => ({ label: `${a === b ? `Day ${a}` : `Days ${a}–${b}`} · ${day(b)}`, value: `${label}: ${what}` }));

  if (mailConfigured(env)) {
    const trackUrl = `${getOrigin(request)}/retail-os/track/${id}`;
    sendEmail(
      {
        to: app.founder_email,
        subject: `${app.brand_name}: your build has started`,
        html: renderRetailOsEmail({
          preheader: `Target go-live: ${targetText}.`,
          eyebrow: 'Build started',
          heading: `Live by ${targetText}`,
          lines: [`Your ₹${DEPOSIT_INR.toLocaleString('en-IN')} deposit is confirmed and your ${BUILD_WINDOW_DAYS}-day build has started. Here's the full checklist with dates.`, 'Answering the setup questions on your page quickly is what keeps me on that date.'],
          cta: { label: 'Answer the first questions', url: trackUrl },
          rows,
        }),
      },
      env
    ).catch((err) => console.error('retail-os mark-deposit-paid founder email failed', err));
  }

  return json({ ok: true, targetText: escapeHtml(targetText), emailedTo: app.founder_email }, 200);
};
