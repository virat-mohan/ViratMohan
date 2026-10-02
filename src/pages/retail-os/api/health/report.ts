export const prerender = false;
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { serviceDb } from '../../../../lib/ledger';

// scripts/health/check.mjs posts its JSON here (HEALTH_REPORT_URL + CRON_SECRET). Bearer CRON_SECRET only.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  const body = await readJson<{ at?: string; report?: { failed?: number }[] }>(request);
  if (!body || !Array.isArray(body.report)) return json({ error: 'expected { at, report: [...] }' }, 400);
  const failed = body.report.reduce((s, r) => s + (Number(r?.failed) || 0), 0);
  const at = body.at && !Number.isNaN(Date.parse(body.at)) ? body.at : new Date().toISOString();
  const ins = await serviceDb(env).from('health_runs').insert({ at, failed, report: body }).select('id').single();
  if (ins.error) return json({ error: ins.error.message }, 500);
  return json({ ok: true, id: ins.data.id, failed }, 200);
};
