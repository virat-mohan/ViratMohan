export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { verifyLeadToken } from '../../../../../lib/lead-token';
import { leadSb } from '../../../../../lib/lead-audit-db';
import { recordNdaSignature } from '../../../../../lib/lead-nda-db';
import { clientIp, json, readJson } from '../../../../../lib/retail-os-http';

// Public, by signed link only. The founder signs the mutual NCNDA by typing their name.
type Body = { entity_name?: string; entity_address?: string; signatory_name?: string; signatory_title?: string; signatory_email?: string; accept?: boolean };

export const POST: APIRoute = async ({ params, request }) => {
  const env = getEnv();
  const leadId = verifyLeadToken(params.token, 'nda', env.LEAD_TOKEN_SECRET);
  if (!leadId) return json({ error: 'This link is not valid.' }, 404);
  const b = await readJson<Body>(request);
  const s = (v?: string, n = 200) => (v || '').trim().slice(0, n);
  const entity = s(b?.entity_name), address = s(b?.entity_address, 400), name = s(b?.signatory_name, 120), title = s(b?.signatory_title, 80), email = s(b?.signatory_email).toLowerCase();
  if (entity.length < 2) return json({ error: 'Enter the legal name of your brand or company.' }, 400);
  if (address.length < 8) return json({ error: 'Enter the registered address.' }, 400);
  if (name.length < 3) return json({ error: 'Type your full name to sign.' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return json({ error: 'That email does not look right.' }, 400);
  if (b?.accept !== true) return json({ error: 'Tick the box to confirm you have read and agree.' }, 400);

  const sb = leadSb(env);
  const { data: lead } = await sb.from('leads').select('id, brand_name, contact_name, contact_email, contact_phone, stage').eq('id', leadId).maybeSingle();
  if (!lead) return json({ error: 'This link is not valid.' }, 404);
  const r = await recordNdaSignature(env, sb, lead, { entity_name: entity, entity_address: address, signatory_name: name, signatory_title: title || null, signatory_email: email || null, ip: clientIp(request), user_agent: (request.headers.get('user-agent') || '').slice(0, 400) || null });
  if (!r.ok) return json({ error: r.error }, 409);
  return json({ ok: true }, 200);
};
