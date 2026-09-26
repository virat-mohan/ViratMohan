export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { extractMessages, handleInbound, verifyMetaSignature } from '../../../lib/ingest/inbound';
import { liveInboundDeps } from '../../../lib/ingest/inbound-db';

// WhatsApp Cloud API webhook.
// GET: Meta's verify-token handshake (hub.mode=subscribe, hub.verify_token, hub.challenge).
// POST: X-Hub-Signature-256 checked against WHATSAPP_APP_SECRET, then each
// message goes through handleInbound (allowlist, commands, brand, ledger).
export const GET: APIRoute = async ({ url }) => {
  const env = getEnv();
  const ok = url.searchParams.get('hub.mode') === 'subscribe' && !!env.WHATSAPP_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.WHATSAPP_VERIFY_TOKEN;
  return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('Forbidden', { status: 403 });
};

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)) return new Response('Bad signature', { status: 401 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }
  const msgs = extractMessages(body);
  if (!msgs.length) return new Response('ok', { status: 200 }); // status callbacks etc.
  const deps = liveInboundDeps(env);
  for (const m of msgs) {
    try { await handleInbound(m, deps); } catch (err) { console.error('whatsapp inbound failed', m.messageId, err); }
  }
  // Always 200 once the signature is good, so Meta does not retry into duplicates.
  return new Response('ok', { status: 200 });
};
