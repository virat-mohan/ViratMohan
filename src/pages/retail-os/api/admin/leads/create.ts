export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { json, readJson } from '../../../../../lib/retail-os-http';
import { leadSb } from '../../../../../lib/lead-audit-db';
import { sendNdaRequest } from '../../../../../lib/lead-nda-db';

// The front door (admin, gated by src/middleware.ts). Three fields make a lead, the NDA is
// drafted at once and Virat gets a one-tap Approve & send. Nothing else to do by hand.
type Body = { brand_name?: string; contact_name?: string; contact_email?: string; contact_phone?: string; website?: string; instagram?: string; category?: string; source?: string; notes?: string; sendNda?: boolean };

export const POST: APIRoute = async ({ request }) => {
  const b = await readJson<Body>(request);
  const brand = (b?.brand_name || '').trim().slice(0, 120);
  const email = (b?.contact_email || '').trim().toLowerCase().slice(0, 200);
  if (!brand) return json({ error: 'Brand name is required' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return json({ error: 'That email does not look right' }, 400);

  const env = getEnv();
  const sb = leadSb(env);
  if (email) {
    const { data: dupe } = await sb.from('leads').select('id, brand_name, stage').ilike('contact_email', email).maybeSingle();
    if (dupe) return json({ error: `${dupe.brand_name} already exists with this email (stage ${dupe.stage}).`, leadId: dupe.id }, 409);
  }
  const clean = (s?: string) => (s || '').trim().slice(0, 300) || null;
  const website = clean(b?.website)?.replace(/^(?!https?:\/\/)/, 'https://') ?? null;
  const { data: lead, error } = await sb.from('leads').insert({
    brand_name: brand, contact_name: clean(b?.contact_name), contact_email: email || null, contact_phone: clean(b?.contact_phone),
    website, instagram: clean(b?.instagram)?.replace(/^@/, '') ?? null, category: clean(b?.category), source: clean(b?.source) ?? 'virat', notes: clean(b?.notes),
    stage: 'new', next_step: 'Approve the NDA email', next_step_due: new Date().toISOString().slice(0, 10),
    research: { website, instagram: clean(b?.instagram) },
  }).select('id, brand_name, contact_name, contact_email, contact_phone, stage').single();
  if (error) return json({ error: error.message }, 500);
  await sb.from('lead_messages').insert({ lead_id: lead.id, direction: 'internal', channel: 'note', status: 'logged', body: `Added by Virat${b?.notes ? `: ${clean(b.notes)}` : ''}.`, created_by: 'admin' });

  let nda: { approveUrl: string | null; sent: boolean; link: string } | null = null;
  if (b?.sendNda !== false && email) {
    try { nda = await sendNdaRequest(env, sb, lead); } catch (e) { return json({ ok: true, leadId: lead.id, warning: `Lead saved, but the NDA draft failed: ${(e as Error).message}` }, 200); }
  }
  return json({ ok: true, leadId: lead.id, nda, note: nda ? (nda.sent ? 'NDA email sent.' : 'NDA email drafted; approve it from the notice I just sent you.') : 'Saved. Add an email to send the NDA.' }, 200);
};
