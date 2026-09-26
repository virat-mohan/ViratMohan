export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { serviceDb } from '../../../lib/ledger';
import { liveDeps, notify } from '../../../lib/notify';
import { parseWebhook, verifyWebhook } from '../../../lib/payouts/razorpayx';
import { inrFromPaise } from '../../../lib/settlement';
import { json } from '../../../lib/retail-os-http';

// RazorpayX payout status webhook. Signed with RAZORPAYX_WEBHOOK_SECRET;
// events are deduplicated by x-razorpay-event-id.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get('x-razorpay-signature'), env.RAZORPAYX_WEBHOOK_SECRET)) return json({ error: 'Bad signature' }, 401);
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Bad JSON' }, 400); }
  const ev = parseWebhook(body);
  if (!ev) return json({ ignored: true }, 200);
  const sb = serviceDb(env);
  const eventId = request.headers.get('x-razorpay-event-id') || `${ev.payoutId}:${ev.event}`;
  const { data: fresh, error: dErr } = await sb.from('payout_events')
    .upsert({ id: eventId, provider: 'razorpayx', event: ev.event, provider_payout_id: ev.payoutId, payload: body }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (dErr) return json({ error: 'Store failed' }, 500);
  if (!fresh?.length) return json({ duplicate: true }, 200);

  const { data: payout } = await sb.from('payouts')
    .update({ status: ev.status, utr: ev.utr, failure_reason: ev.failureReason, updated_at: new Date().toISOString() })
    .eq('provider_payout_id', ev.payoutId).select('settlement_id, brand_key, amount_paise').maybeSingle();
  if (!payout) return json({ unknown_payout: true }, 200);

  const now = new Date();
  const deps = liveDeps(env, sb, now);
  if (ev.status === 'processed') {
    const { data: s } = await sb.from('settlements').update({ status: 'paid', paid_at: now.toISOString() }).eq('id', payout.settlement_id).select('week_start, week_end').single();
    const { data: t } = await sb.from('brand_terms').select('statement_whatsapp').eq('brand_key', payout.brand_key).maybeSingle();
    if (t?.statement_whatsapp && s) {
      const amount = inrFromPaise(Number(payout.amount_paise));
      const text = `Your payout of ${amount} for the week of ${s.week_start} is sent.${ev.utr ? ` UTR ${ev.utr}.` : ''} Statement is in your email. – Virat`;
      const template = env.WHATSAPP_PAYOUT_TEMPLATE ? { name: env.WHATSAPP_PAYOUT_TEMPLATE, lang: 'en', params: [amount, s.week_start, ev.utr ?? '-'] } : undefined;
      await notify({ channel: 'whatsapp', to: t.statement_whatsapp, text, template, dedupeKey: `payout-sent:${ev.payoutId}` }, deps).catch((e) => console.error('payout notice failed', e));
    }
  } else if (['reversed', 'failed', 'rejected', 'cancelled'].includes(ev.status)) {
    await sb.from('settlements').update({ status: 'held', hold_reasons: ['payout_failed'] }).eq('id', payout.settlement_id);
    if (env.ADMIN_NOTIFY_EMAIL) {
      await notify({ channel: 'email', to: env.ADMIN_NOTIFY_EMAIL, subject: `Payout ${ev.status}: ${payout.brand_key}`, html: `<p>Payout ${ev.payoutId} for ${payout.brand_key} is ${ev.status}. ${ev.failureReason ?? ''}</p>`, dedupeKey: `payout-fail:${ev.payoutId}` }, deps).catch(() => {});
    }
  }
  return json({ ok: true }, 200);
};
