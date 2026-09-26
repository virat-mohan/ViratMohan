export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { verifyLeadToken } from '../../../../lib/lead-token';
import { leadCanSet, type AccessStatus } from '../../../../lib/lead-access';
import { MAX_CSV_BYTES } from '../../../../lib/lead-csv';
import { connectSource, getLead, isSource, leadSb, listAccess, markStatus, uploadCsv } from '../../../../lib/lead-audit-db';

// The lead's own actions on their access checklist. The signed token is the only key.
//   { action: 'status',  source, status: 'not_started' | 'granted' }
//   { action: 'connect', source, fields: { shop, token } | { ad_account_id } | { property_id } | { site_url } }
//   { action: 'csv',     source, csv: '<file text>' }
export const POST: APIRoute = async ({ params, request }) => {
  const env = getEnv();
  const leadId = verifyLeadToken(params.token, 'access', env.LEAD_TOKEN_SECRET);
  if (!leadId) return json({ error: 'This link is not valid.' }, 404);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_CSV_BYTES + 4096) return json({ error: 'That file is too large.' }, 413);

  const body = await readJson<{ action?: string; source?: string; status?: string; fields?: Record<string, string>; csv?: string }>(request);
  if (!body || !isSource(body.source)) return json({ error: 'Unknown source.' }, 400);
  const source = body.source;

  let sb;
  try { sb = leadSb(env); } catch { return json({ error: 'Backend not configured' }, 503); }
  const lead = await getLead(sb, leadId);
  if (!lead) return json({ error: 'This link is not valid.' }, 404);

  if (body.action === 'status') {
    const to = body.status as AccessStatus;
    const from = (await listAccess(sb, lead.id)).find((r) => r.source === source)?.status ?? 'not_started';
    if (!['not_started', 'granted'].includes(to) || !leadCanSet(from, to)) return json({ error: 'That status is set automatically once the data comes through.' }, 400);
    await markStatus(sb, lead, source, to);
    return json({ ok: true, status: to }, 200);
  }
  if (body.action === 'connect') {
    if (!body.fields || typeof body.fields !== 'object') return json({ error: 'Nothing to save.' }, 400);
    const res = await connectSource(env, sb, lead, source, body.fields);
    return json(res.ok ? { ok: true, status: 'verified' } : { ok: false, status: 'granted', error: res.error }, 200);
  }
  if (body.action === 'csv') {
    if (typeof body.csv !== 'string' || !body.csv.trim()) return json({ error: 'The file is empty.' }, 400);
    const res = await uploadCsv(sb, lead, source, body.csv);
    return json(res.ok ? { ok: true, status: 'verified', period: res.period } : { ok: false, error: res.error }, res.ok ? 200 : 422);
  }
  return json({ error: 'Unknown action.' }, 400);
};
