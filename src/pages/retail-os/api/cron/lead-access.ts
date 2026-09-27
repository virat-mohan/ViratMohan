export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json } from '../../../../lib/retail-os-http';
import { leadSb, refreshConnectors, remindStalled } from '../../../../lib/lead-audit-db';
import { journeyApproval } from '../../../../lib/lead-approve';
import { remindUnsignedNda } from '../../../../lib/lead-nda-db';
import { scanForCaseStudies } from '../../../../lib/case-studies';
import { draftBuildUpdates } from '../../../../lib/lead-build-updates';
import { getLiveBrands } from '../../../../lib/retail-os-portfolio';
import { sendEmail } from '../../../../lib/email';
import { renderRetailOsEmail } from '../../../../lib/retail-os-email';

// Daily (vercel.json). Drafts a reminder for leads whose access has stalled 48h (for Virat's approval,
// send_after inside 9am-8pm IST), on Mondays refreshes verified connectors, and scans every live
// brand for a new Successful Case Study (a draft on the founder console, never published on its own).
export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  if (!env.LEAD_TOKEN_SECRET) return json({ error: 'LEAD_TOKEN_SECRET is not set' }, 503);
  const sb = leadSb(env);
  const reminded = await remindStalled(env, sb, journeyApproval(env, sb));
  const ndaReminded = await remindUnsignedNda(env, sb);
  const refreshed = new Date().getUTCDay() === 1 ? await refreshConnectors(env, sb) : 0;
  const buildUpdates = await draftBuildUpdates(env, sb);
  const studies = await scanForCaseStudies(sb, getLiveBrands());
  const to = env.ADMIN_NOTIFY_EMAIL || env.GMAIL_ADDRESS;
  if (studies.length && to) {
    await sendEmail({
      to, subject: `${studies.length === 1 ? 'A new case study' : `${studies.length} new case studies`} to publish`,
      html: renderRetailOsEmail({
        preheader: studies.map((s) => s.headline).join('; '),
        eyebrow: 'Needs you', heading: 'A result worth publishing',
        lines: studies.map((s) => `${s.brand_name}: ${s.headline}. ${s.base_note}`),
        cta: { label: 'Review on the founder console', url: 'https://viratmohan.com/retail-os/admin/console#needs-you' },
        note: 'Nothing is public until you publish it there. The brand name never leaves the console.',
      }),
    }, env).catch((e) => console.error('case study notice failed', e));
  }
  return json({ ok: true, reminded, ndaReminded, refreshed, buildUpdates, caseStudies: studies.length }, 200);
};
