export const prerender = false;

import type { APIRoute } from 'astro';
import { computePlanFromDrivers } from '../../../../lib/retail-os-business-plan';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getOrigin } from '../../../../lib/http';
import { renderRetailOsEmail } from '../../../../lib/retail-os-email';
import { json, readJson } from '../../../../lib/retail-os-http';
import { mailConfigured } from '../../../../lib/mail/send';

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

  // Keep the forecast on the same split the brand is signing.
  if (splitPct != null) {
    const plan = await db.getLatestBusinessPlan(id).catch(() => null);
    if (plan) {
      const drivers = { ...plan.drivers, splitPct, lockedByAdmin: true };
      const { months, quarterTotals } = computePlanFromDrivers(drivers, splitPct);
      const labelled = months.map((m, i) => ({ ...m, label: plan.months[i]?.label ?? m.label }));
      await db.updatePlanDrivers(plan.id, drivers, labelled, quarterTotals).catch((err) => console.error('send-terms plan resplit failed', err));
    }
  }

  const trackUrl = `${getOrigin(request)}/retail-os/track/${id}`;
  if (mailConfigured(env)) {
    sendEmail(
      {
        to: app.founder_email,
        subject: `${app.brand_name}: your terms are ready to sign`,
        html: renderRetailOsEmail({
          preheader: 'Review and sign on your page.',
          eyebrow: 'Next step',
          heading: 'Your terms are ready',
          lines: [`I've reviewed ${app.brand_name}. Read your terms and sign on your page; it takes two minutes.`, 'Then the ₹5,000 deposit, and your store goes live within 7 days.'],
          cta: { label: 'Review and sign', url: trackUrl },
        }),
      },
      env
    ).catch((err) => console.error('retail-os send-terms email failed', err));
  }
  return json({ ok: true }, 200);
};
