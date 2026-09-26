export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb, BUILD_WINDOW_DAYS } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { renderRetailOsEmail } from '../../../../lib/retail-os-email';
import { json, readJson } from '../../../../lib/retail-os-http';
import { mailConfigured } from '../../../../lib/mail/send';

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
          lines: ['Your deposit is confirmed and your 7-day build has started.', 'The setup questions on your page open one at a time. Answering them quickly is what keeps me on that date.'],
          cta: { label: 'Answer the first questions', url: trackUrl },
        }),
      },
      env
    ).catch((err) => console.error('retail-os confirm-deposit email failed', err));
  }
  return json({ ok: true }, 200);
};
