export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';

// Gated by src/middleware.ts. Edits a brand's application answers in place.
const TEXT_FIELDS = [
  'brand_name', 'founder_name', 'founder_email', 'founder_phone', 'brand_status', 'category', 'format', 'handle',
  'has_revenue', 'revenue_range', 'following', 'catalog_mode', 'shopify_url', 'product_count',
  'product_noun_singular', 'product_noun_plural', 'payment_mode', 'payment_methods', 'shipping_charge_model',
  'free_shipping_threshold', 'return_window', 'same_day_delivery', 'same_day_cities', 'carrier', 'pincode',
  'meta_bm', 'ad_budget', 'wa_number', 'target_cities', 'business_registration',
] as const;

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ id?: string; fields?: Record<string, unknown> }>(request);
  const id = (body?.id || '').trim();
  if (!id || !body?.fields) return json({ error: 'id and fields are required' }, 400);

  const update: Record<string, unknown> = {};
  for (const k of TEXT_FIELDS) {
    if (k in body.fields) {
      const v = String(body.fields[k] ?? '').trim().slice(0, 500);
      update[k] = v || null;
    }
  }
  if (typeof body.fields.store_categories === 'string') {
    const cats = body.fields.store_categories.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 30);
    update.store_categories = cats.length ? cats : null;
  }
  if ('post_ack' in body.fields) update.post_ack = body.fields.post_ack === true || body.fields.post_ack === 'true' || body.fields.post_ack === 'Yes';
  for (const k of ['split_range_lo', 'split_range_hi'] as const) {
    if (k in body.fields) {
      const n = Number(body.fields[k]);
      update[k] = Number.isFinite(n) && n >= 0 && n <= 90 ? n : null;
    }
  }
  if (update.brand_name === null) return json({ error: 'Brand name cannot be empty.' }, 400);
  if (update.founder_email === null) return json({ error: 'Founder email cannot be empty.' }, 400);

  const env = getEnv();
  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Application not found' }, 404);
  await db.updateApplicationFields(id, update);
  return json({ ok: true }, 200);
};
