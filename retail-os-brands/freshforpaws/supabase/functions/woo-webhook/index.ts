// WooCommerce webhook receiver (order.created, order.updated, product.updated).
// WooCommerce signs each delivery: X-WC-Webhook-Signature = base64(HMAC-SHA256(raw body, WOO_WEBHOOK_SECRET)).
// verify_jwt is off for this function because WooCommerce cannot send a Supabase JWT; the HMAC is the auth.
import { db, upsertOrder, upsertProduct, hmacBase64, safeEqual } from '../_shared/woo.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok'); // WooCommerce pings with a GET/empty POST when the hook is saved
  const raw = await req.text();
  const topic = req.headers.get('x-wc-webhook-topic') ?? '';
  if (!topic) return new Response('ok'); // the save-time ping has no topic
  const secret = Deno.env.get('WOO_WEBHOOK_SECRET');
  if (!secret) return new Response('webhook secret not configured', { status: 503 });
  const given = req.headers.get('x-wc-webhook-signature') ?? '';
  if (!safeEqual(given, await hmacBase64(secret, raw))) return new Response('bad signature', { status: 401 });

  try {
    const body = JSON.parse(raw);
    const sb = db();
    if (topic.startsWith('order.')) await upsertOrder(sb, body);
    else if (topic.startsWith('product.')) await upsertProduct(sb, body);
    return new Response(JSON.stringify({ ok: true, topic }), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    console.error('woo-webhook failed', topic, err);
    return new Response('error', { status: 500 }); // WooCommerce retries on 5xx
  }
});
