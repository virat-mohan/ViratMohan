// WooCommerce -> Retail OS mapping, shared by the webhook and the sync job.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function db(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

const rupees = (v: unknown) => Math.round(Number(v ?? 0) || 0);

// WooCommerce status -> Retail OS status.
export function mapStatus(s: string): string {
  switch (s) {
    case 'processing': return 'paid';
    case 'completed': return 'fulfilled';
    case 'refunded': return 'refunded';
    case 'cancelled': case 'failed': case 'trash': return 'cancelled';
    default: return 'pending'; // pending, on-hold, checkout-draft
  }
}

const meta = (o: any, k: string) => (o.meta_data ?? []).find((m: any) => m.key === k)?.value ?? null;

export async function upsertOrder(sb: SupabaseClient, o: any): Promise<string> {
  const b = o.billing ?? {}, sh = o.shipping ?? {};
  const name = [b.first_name, b.last_name].filter(Boolean).join(' ').trim() || null;
  const email = (b.email || '').trim().toLowerCase() || null;

  let customer_id: string | null = null;
  if (o.customer_id) {
    const { data, error } = await sb.from('customers').upsert({ woo_customer_id: o.customer_id, name, email, phone: b.phone || null, city: sh.city || b.city || null, state: sh.state || b.state || null, pincode: sh.postcode || b.postcode || null }, { onConflict: 'woo_customer_id' }).select('id').single();
    if (error) throw error;
    customer_id = data.id;
  }

  const lines = (o.line_items ?? []) as any[];
  const subtotal = lines.reduce((n, l) => n + rupees(l.subtotal), 0);
  const refunded = Math.abs((o.refunds ?? []).reduce((n: number, r: any) => n + Number(r.total ?? 0), 0));
  const coupons = (o.coupon_lines ?? []) as any[];
  const method = o.payment_method || null;

  const row = {
    woo_order_id: o.id,
    woo_order_number: String(o.number ?? o.id),
    woo_status: o.status,
    status: mapStatus(o.status),
    created_at: o.date_created_gmt ? o.date_created_gmt + 'Z' : new Date().toISOString(),
    modified_at: o.date_modified_gmt ? o.date_modified_gmt + 'Z' : null,
    customer_id,
    customer_name: name,
    customer_phone: b.phone || null,
    customer_email: email,
    delivery_address: [sh.address_1, sh.address_2].filter(Boolean).join(', ') || [b.address_1, b.address_2].filter(Boolean).join(', ') || null,
    delivery_city: sh.city || b.city || null,
    delivery_state: sh.state || b.state || null,
    delivery_pincode: sh.postcode || b.postcode || null,
    subtotal,
    discount_amount: rupees(o.discount_total),
    coupon_code_used: coupons.map((c) => c.code).join(',') || null,
    coupon_discount_amount: coupons.reduce((n, c) => n + rupees(c.discount), 0),
    shipping_charge: rupees(o.shipping_total),
    total: rupees(o.total),
    refunded_amount: Math.round(refunded),
    payment_type: method === 'cod' ? 'cod' : 'prepaid',
    payment_method: method,
    payment_status: o.date_paid_gmt ? 'paid' : 'unpaid',
    razorpay_payment_id: method && method.includes('razorpay') ? (o.transaction_id || null) : null,
    is_post_barter: meta(o, '_pay_with_a_post') === 'yes',
    delivered_at: o.date_completed_gmt ? o.date_completed_gmt + 'Z' : null,
    utm_source: meta(o, '_wc_order_attribution_utm_source'),
    utm_medium: meta(o, '_wc_order_attribution_utm_medium'),
    utm_campaign: meta(o, '_wc_order_attribution_utm_campaign'),
    synced_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from('orders').upsert(row, { onConflict: 'woo_order_id' }).select('id').single();
  if (error) throw error;

  const items = lines.map((l) => ({ order_id: data.id, woo_line_id: l.id, woo_product_id: l.product_id || null, sku: l.sku || null, product_name: l.name, unit_price: rupees(l.price), quantity: Number(l.quantity) || 1, line_total: rupees(l.total) }));
  if (items.length) {
    const { error: e2 } = await sb.from('order_items').upsert(items, { onConflict: 'order_id,woo_line_id' });
    if (e2) throw e2;
  }
  return data.id;
}

export async function upsertProduct(sb: SupabaseClient, p: any) {
  const { error } = await sb.from('products').upsert({
    woo_product_id: p.id, name: p.name, sku: p.sku || null,
    category: (p.categories ?? [])[0]?.name ?? null,
    price: p.price === '' ? null : rupees(p.price),
    stock_status: p.stock_status ?? null, stock_quantity: p.stock_quantity ?? null,
    active: p.status === 'publish', updated_at: new Date().toISOString(),
  }, { onConflict: 'woo_product_id' }); // cost_per_pack, pack_size and shelf life are set from the founder's sheet, never overwritten here
  if (error) throw error;
}

export async function hmacBase64(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
