export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../../lib/env';
import { json } from '../../../../../../lib/retail-os-http';
import { getLead, leadSb, requestAccess } from '../../../../../../lib/lead-audit-db';

// Admin (Basic Auth via middleware): after the NDA is signed, draft the access-request email.
// The draft waits in lead_messages as awaiting_approval; nothing is sent from here.
export const POST: APIRoute = async ({ params }) => {
  const env = getEnv();
  if (!env.LEAD_TOKEN_SECRET) return json({ error: 'LEAD_TOKEN_SECRET is not set' }, 503);
  const sb = leadSb(env);
  const lead = await getLead(sb, params.id ?? '');
  if (!lead) return json({ error: 'Not found' }, 404);
  if (!['nda_signed', 'access_requested'].includes(lead.stage)) return json({ error: `Lead is at ${lead.stage}; access is requested after the NDA is signed.` }, 409);
  try {
    const res = await requestAccess(env, sb, lead);
    return json({ ok: true, stage: 'access_requested', messageId: res.messageId, link: res.link, note: 'Draft awaiting your approval.' }, 200);
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
};
