export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../../lib/env';
import { json } from '../../../../../../lib/retail-os-http';
import { leadSb } from '../../../../../../lib/lead-audit-db';
import { getNda, sendNdaReminder, sendNdaRequest } from '../../../../../../lib/lead-nda-db';

// Admin: draft the NDA email (first time) or a gentle reminder (if already sent). One-tap approval follows.
export const POST: APIRoute = async ({ params }) => {
  const env = getEnv();
  const sb = leadSb(env);
  const { data: lead } = await sb.from('leads').select('id, brand_name, contact_name, contact_email, contact_phone, stage, nda_sent_at').eq('id', params.id ?? '').maybeSingle();
  if (!lead) return json({ error: 'Not found' }, 404);
  if (await getNda(sb, lead.id)) return json({ error: 'Already signed.' }, 409);
  try {
    const r = lead.stage === 'nda_sent' ? await sendNdaReminder(env, sb, lead) : await sendNdaRequest(env, sb, lead);
    return json({ ok: true, ...r, note: r.sent ? 'Sent.' : 'Drafted. Approve it from the notice I sent you.' }, 200);
  } catch (e) { return json({ error: (e as Error).message }, 400); }
};
