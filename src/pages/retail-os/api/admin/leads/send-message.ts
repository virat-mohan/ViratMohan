export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { serviceDb } from '../../../../../lib/ledger';
import { json, readJson } from '../../../../../lib/retail-os-http';
import { sendNow } from '../../../../../lib/lead-approve';

// Gated by src/middleware.ts: Virat approves a parked draft from the founder console with one
// click. Same path as the emailed Approve & send link (lead-approve.ts sendNow), so the stage
// moves the same way.
export const POST: APIRoute = async ({ request }) => {
  const b = await readJson<{ id?: string }>(request);
  const id = (b?.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);
  const env = getEnv();
  const sb = serviceDb(env);
  const { data: m } = await sb.from('lead_messages').select('id, lead_id, subject, body, purpose, status, meta').eq('id', id).maybeSingle();
  if (!m) return json({ error: 'Draft not found' }, 404);
  if (m.status !== 'awaiting_approval') return json({ error: 'This draft has already been handled' }, 409);
  const { data: lead } = await sb.from('leads').select('contact_email').eq('id', m.lead_id).maybeSingle();
  if (!lead?.contact_email) return json({ error: 'This lead has no email address' }, 400);
  try {
    const via = await sendNow(env, sb, { id: m.id, lead_id: m.lead_id, subject: m.subject ?? 'From Virat', body: m.body, purpose: m.purpose, to: lead.contact_email, html: typeof m.meta?.html === 'string' ? m.meta.html : null });
    return json({ ok: true, via }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};
