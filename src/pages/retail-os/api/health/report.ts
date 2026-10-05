export const prerender = false;
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { serviceDb } from '../../../../lib/ledger';
import { createSupabaseWorkStore } from '../../../../lib/work/db-store';
import { runHealthIngestion } from '../../../../lib/work/health-runner';
import type { HealthRun } from '../../../../lib/work/health-ingest';

// scripts/health/check.mjs posts its JSON here (HEALTH_REPORT_URL + CRON_SECRET). Bearer CRON_SECRET only.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  const body = await readJson<{ at?: string; report?: { brand: string; failed?: number; results: unknown[] }[] }>(request);
  if (!body || !Array.isArray(body.report)) return json({ error: 'expected { at, report: [...] }' }, 400);
  const failed = body.report.reduce((s, r) => s + (Number(r?.failed) || 0), 0);
  const at = body.at && !Number.isNaN(Date.parse(body.at)) ? body.at : new Date().toISOString();
  const sb = serviceDb(env);
  const ins = await sb.from('health_runs').insert({ at, failed, report: body }).select('id').single();
  if (ins.error) return json({ error: ins.error.message }, 500);

  let workResult: { ok: boolean; created?: number; attached?: number; error?: string } = { ok: true, created: 0, attached: 0 };
  if (failed > 0) {
    try {
      const store = createSupabaseWorkStore(sb);
      const r = await runHealthIngestion(store, body as HealthRun);
      workResult = r.ok
        ? { ok: true, created: r.outcome!.created, attached: r.outcome!.attached }
        : { ok: false, error: r.error };
    } catch (err) {
      workResult = { ok: false, error: `ingestion error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return json({ ok: true, id: ins.data.id, failed, work: workResult }, 200);
};
