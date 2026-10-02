export const prerender = false;
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { serviceDb } from '../../../../lib/ledger';
import { parseUpdate } from '../../../../lib/org-board';
import { orgWriteAllowed } from '../../../../lib/org-auth';

// POST a status row to the org board. Bearer CRON_SECRET (agents, scheduled tasks) or admin auth.
// Body: { member_id, status, summary, pending?, stuck_on?, help_needed?, next_step?, links? }. See case-study/ORG-SOP.md.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!orgWriteAllowed(request.headers.get('authorization'), env.CRON_SECRET, process.env.ADMIN_PASSWORD)) return json({ error: 'Unauthorized' }, 401);
  const sb = serviceDb(env);
  const { data, error } = await sb.from('org_members').select('id');
  if (error) return json({ error: 'org_members could not be read' }, 503);
  const parsed = parseUpdate(await readJson(request), new Set((data ?? []).map((m: { id: string }) => m.id)));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const ins = await sb.from('org_updates').insert(parsed.row).select('id, at').single();
  if (ins.error) return json({ error: ins.error.message }, 500);
  return json({ ok: true, ...ins.data }, 200);
};
