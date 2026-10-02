export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { serviceDb } from '../../../../../lib/ledger';
import { json } from '../../../../../lib/retail-os-http';
import { canReplyFreeForm, type InboxMessage } from '../../../../../lib/whatsapp-inbox';

// Gated by src/middleware.ts (admin Basic Auth). Reply from the inbox, or mark a thread read.
// POST { phone, text } sends a free-form reply (only inside Meta's 24-hour window);
// POST { phone, read: true } marks the thread read.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv(); const sb = serviceDb(env);
  const b = await request.json().catch(() => ({}));
  const phone = String(b.phone ?? '').replace(/\D/g, '');
  if (!phone) return json({ error: 'Which number?' }, 400);
  if (b.read) {
    await sb.from('whatsapp_messages').update({ read_at: new Date().toISOString() }).eq('contact_phone', phone).eq('direction', 'in').is('read_at', null);
    return json({ ok: true }, 200);
  }
  const text = String(b.text ?? '').trim();
  if (!text) return json({ error: 'Write a reply first.' }, 400);
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return json({ error: 'WhatsApp is not connected yet (Brand & settings → Integrations).' }, 503);
  const { data } = await sb.from('whatsapp_messages').select('direction, at').eq('contact_phone', phone).order('at', { ascending: false }).limit(50);
  if (!canReplyFreeForm((data ?? []) as InboxMessage[])) return json({ error: 'More than 24 hours since their last message. Meta only allows an approved template now; reply from the phone app or ask them to message first.' }, 409);
  const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text, preview_url: false } }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('inbox send failed', res.status, out); return json({ error: `WhatsApp refused it (${res.status}).` }, 502); }
  await sb.from('whatsapp_messages').insert({ wa_message_id: out?.messages?.[0]?.id ?? null, direction: 'out', contact_phone: phone, body: text, status: 'sent', sent_by: 'dashboard' });
  return json({ ok: true }, 200);
};
