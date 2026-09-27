export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb, BUILD_WINDOW_DAYS } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { renderRetailOsEmail } from '../../../../lib/retail-os-email';
import { json, readJson } from '../../../../lib/retail-os-http';
import { mailConfigured } from '../../../../lib/mail/send';
import { syncLeadFromApplication } from '../../../../lib/lead-sync';
import { seedBrandSetupTasks } from '../../../../lib/ops-seed';

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
  syncLeadFromApplication(db.client, app, 'deposit_paid').catch(() => {});
  seedBrandSetupTasks(db.client, app.brand_name).catch((e) => console.error('ops seed failed', e));

  const start = new Date(app.build_started_at ?? Date.now());
  const target = new Date(start.getTime() + BUILD_WINDOW_DAYS * 86400000);
  const targetText = target.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

  if (mailConfigured(env)) {
    const trackUrl = `${getOrigin(request)}/retail-os/track/${id}`;
    sendEmail(
      {
        to: app.founder_email,
        subject: `${app.brand_name}: your build has started`,
        html: renderRetailOsEmail({
          preheader: `Target go-live: ${targetText}.`,
          eyebrow: 'Welcome',
          heading: `Live by ${targetText}`,
          lines: [
            'Your deposit is confirmed and your 7-day build has started. Welcome.',
            'How the week runs: I build the store, payments, shipping, WhatsApp and Meta from your data. Every 2 days you get a short note from me: done, next, and anything I need from you. On day 6 you see the store before it opens and say yes.',
            'The setup questions on your page open one at a time. Answering them quickly is what keeps me on that date.',
            'I will add you to a WhatsApp group with me for anything quick. Money, terms and promises always come from me directly.',
          ],
          cta: { label: 'Answer the first questions', url: trackUrl },
        }),
      },
      env
    ).catch((err) => console.error('retail-os confirm-deposit email failed', err));
  }
  return json({ ok: true }, 200);
};
