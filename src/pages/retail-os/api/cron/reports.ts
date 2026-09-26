export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getLiveBrands, istToday } from '../../../../lib/retail-os-portfolio';
import { buildBrandReport, renderReportEmail, type BrandReport } from '../../../../lib/retail-os-reports';
import { json } from '../../../../lib/retail-os-http';
import { mailConfigured } from '../../../../lib/mail/send';

// Run once a day by Vercel Cron (vercel.json, 03:00 UTC = 08:30 IST). Sends
// daily reports every day, weekly reports on Mondays and monthly reports on
// the 1st. Vercel sends CRON_SECRET as a Bearer token; without it set, the
// route refuses to run.
export const GET: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!mailConfigured(env)) return json({ error: 'Email is not configured' }, 503);

  const today = istToday();
  const isMonday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
  const isFirst = today.endsWith('-01');
  const due = (f: string) => f === 'daily' || (f === 'weekly' && isMonday) || (f === 'monthly' && isFirst);

  const db = getRetailOsDb(env);
  const brands = getLiveBrands();
  const schedules = (await db.listReportSchedules()).filter((s) => s.active && due(s.frequency));
  const cache = new Map<string, Promise<BrandReport>>();
  const results: { id: string; status: string }[] = [];

  for (const s of schedules) {
    // Guard against a double send if the cron is retried the same morning.
    if (s.last_sent_at && Date.now() - Date.parse(s.last_sent_at) < 20 * 3600 * 1000) { results.push({ id: s.id, status: 'already sent' }); continue; }
    const brand = brands.find((b) => b.key === s.brand_key);
    if (!brand) { results.push({ id: s.id, status: 'brand not configured' }); continue; }
    if (s.channel === 'whatsapp') { results.push({ id: s.id, status: 'whatsapp not connected yet' }); continue; }
    try {
      const k = `${brand.key}:${s.frequency}`;
      if (!cache.has(k)) cache.set(k, buildBrandReport(brand, s.frequency));
      const report = await cache.get(k)!;
      await sendEmail({ to: s.recipient, subject: `${brand.name} — ${report.period.label}`, html: renderReportEmail(report) }, env);
      await db.markReportScheduleSent(s.id);
      results.push({ id: s.id, status: 'sent' });
    } catch (err) {
      console.error('retail-os scheduled report failed', s.id, err);
      results.push({ id: s.id, status: 'failed' });
    }
  }
  return json({ today, results }, 200);
};
