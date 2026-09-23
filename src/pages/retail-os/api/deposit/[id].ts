export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb, DEPOSIT_INR } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { renderRetailOsEmail } from '../../../../lib/retail-os-email';
import { json, readJson } from '../../../../lib/retail-os-http';

// The founder reports their UPI deposit by its reference number (UTR). An
// admin confirms it against the bank statement, which starts the build clock.
export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return json({ error: 'Missing id' }, 400);
  const body = await readJson<{ utr?: string }>(request);
  const utr = (body?.utr || '').replace(/\s+/g, '').slice(0, 40);
  if (!/^[A-Za-z0-9]{6,40}$/.test(utr)) return json({ error: 'Enter the UPI reference number (UTR) from your payment app.' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Not found' }, 404);
  if (!app.agreement) return json({ error: 'Sign your terms before paying the deposit.' }, 409);
  if (app.deposit?.confirmedAt) return json({ error: 'Your deposit is already confirmed.' }, 409);

  await db.submitDeposit(id, { amountInr: DEPOSIT_INR, utr, submittedAt: new Date().toISOString(), confirmedAt: null });

  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && env.ADMIN_NOTIFY_EMAIL) {
    sendEmail(
      {
        to: env.ADMIN_NOTIFY_EMAIL,
        subject: `Confirm deposit: ${app.brand_name}`,
        html: renderRetailOsEmail({
          preheader: `UTR ${utr} to check against the bank statement.`,
          eyebrow: 'Action needed',
          heading: 'Confirm a deposit',
          lines: [`${app.brand_name} reports paying the ₹${DEPOSIT_INR.toLocaleString('en-IN')} deposit. Check the reference against the bank statement, then confirm to start their 7-day build.`],
          rows: [{ label: 'UTR', value: utr }],
          cta: { label: 'Confirm in admin', url: `${getOrigin(request)}/retail-os/admin` },
        }),
        replyTo: app.founder_email,
      },
      env
    ).catch((err) => console.error('retail-os deposit admin email failed', err));
  }

  return json({ ok: true }, 200);
};
