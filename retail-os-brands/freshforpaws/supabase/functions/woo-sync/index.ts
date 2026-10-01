// Pulls orders and products from the WooCommerce REST API (read-only key) into Retail OS.
// Runs hourly from pg_cron as a safety net for missed webhooks, and once with ?backfill_days=90 at setup.
// Auth: header x-cron-secret must equal CRON_SECRET (verify_jwt is off so pg_cron can call it).
import { db, upsertOrder, upsertProduct } from '../_shared/woo.ts';

async function wooGet(path: string, params: Record<string, string>) {
  const base = Deno.env.get('WOO_STORE_URL')!.replace(/\/$/, '');
  const url = new URL(`${base}/wp-json/wc/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const auth = btoa(`${Deno.env.get('WOO_CONSUMER_KEY')}:${Deno.env.get('WOO_CONSUMER_SECRET')}`);
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`WooCommerce ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { rows: (await res.json()) as any[], pages: Number(res.headers.get('x-wp-totalpages') ?? '1') };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 });
  for (const k of ['WOO_STORE_URL', 'WOO_CONSUMER_KEY', 'WOO_CONSUMER_SECRET']) if (!Deno.env.get(k)) return new Response(`${k} not configured`, { status: 503 });

  const sb = db();
  const url = new URL(req.url);
  const backfill = Number(url.searchParams.get('backfill_days') ?? '0');
  const { data: state } = await sb.from('woo_sync_state').select('*').eq('id', 'orders').maybeSingle();
  const since = backfill > 0
    ? new Date(Date.now() - backfill * 86400000)
    : new Date(state?.last_modified_after ?? Date.now() - 2 * 86400000);
  const startedAt = new Date();

  let orders = 0, products = 0;
  try {
    for (let page = 1; ; page++) {
      const { rows, pages } = await wooGet('orders', { modified_after: since.toISOString().slice(0, 19), per_page: '100', page: String(page), orderby: 'modified', order: 'asc' });
      for (const o of rows) { await upsertOrder(sb, o); orders++; }
      if (page >= pages || rows.length === 0) break;
    }
    for (let page = 1; ; page++) {
      const { rows, pages } = await wooGet('products', { per_page: '100', page: String(page) });
      for (const p of rows) { await upsertProduct(sb, p); products++; }
      if (page >= pages || rows.length === 0) break;
    }
    // Overlap one hour so an order modified mid-run is never skipped.
    const next = new Date(startedAt.getTime() - 3600000).toISOString();
    await sb.from('woo_sync_state').upsert({ id: 'orders', last_modified_after: next, last_run_at: new Date().toISOString(), last_result: { ok: true, orders, products } });
    return Response.json({ ok: true, orders, products, since: since.toISOString() });
  } catch (err) {
    await sb.from('woo_sync_state').upsert({ id: 'orders', last_modified_after: state?.last_modified_after ?? null, last_run_at: new Date().toISOString(), last_result: { ok: false, error: String(err), orders, products } });
    console.error('woo-sync failed', err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
