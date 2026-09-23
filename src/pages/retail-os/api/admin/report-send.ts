export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { sendEmail } from '../../../../lib/email';
import { getLiveBrands } from '../../../../lib/retail-os-portfolio';
import { buildBrandReport, renderReportEmail, type ReportKind } from '../../../../lib/retail-os-reports';
import { json, readJson } from '../../../../lib/retail-os-http';

// Gated by src/middleware.ts. Emails one brand report right now.
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ brandKey?: string; kind?: ReportKind; to?: string }>(request);
  const brand = getLiveBrands().find((b) => b.key === body?.brandKey);
  if (!brand) return json({ error: 'Unknown brand' }, 400);
  const kind = (['daily', 'weekly', 'monthly', 'mtd'] as ReportKind[]).includes(body?.kind as ReportKind) ? (body!.kind as ReportKind) : 'weekly';
  const to = (body?.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ error: 'Enter a valid email address' }, 400);

  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) return json({ error: 'Email is not configured' }, 503);
  try {
    const report = await buildBrandReport(brand, kind);
    await sendEmail({ to, subject: `${brand.name} — ${report.period.label}`, html: renderReportEmail(report) }, env);
    return json({ ok: true }, 200);
  } catch (err) {
    console.error('retail-os report-send failed', err);
    return json({ error: err instanceof Error ? err.message : 'Report failed' }, 500);
  }
};
