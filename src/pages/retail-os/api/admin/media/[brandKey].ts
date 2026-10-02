export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { json, readJson } from '../../../../../lib/retail-os-http';
import { brandsDb } from '../../../../../lib/brands';
import { connectSource, getLead, leadSb, listAccess } from '../../../../../lib/lead-audit-db';
import { decryptSecret } from '../../../../../lib/lead-token';
import { pullShopifyImages, saveMedia } from '../../../../../lib/media-assets';

// Admin (gated by src/middleware.ts). Media assets for one brand.
//   { action: 'connect', shop, token }  saves the Shopify store and read-only token (encrypted) on the brand's lead
//   { action: 'import' }                pulls every product image from Shopify into the library
export const POST: APIRoute = async ({ params, request }) => {
  const env = getEnv();
  const key = String(params.brandKey ?? '').toLowerCase();
  const body = await readJson<{ action?: string; shop?: string; token?: string }>(request);
  if (!body) return json({ error: 'Bad request' }, 400);
  let sb;
  try { sb = leadSb(env); } catch { return json({ error: 'Backend not configured' }, 503); }
  const brand = (await brandsDb(env).list()).find((b) => b.key === key);
  if (!brand) return json({ error: 'Unknown brand.' }, 404);
  if (!brand.lead_id) return json({ error: 'This brand has no lead record to hold its Shopify connection.' }, 409);
  const lead = await getLead(sb, brand.lead_id);
  if (!lead) return json({ error: 'Lead record not found.' }, 404);

  let salesNote: string | null = null;
  try {
    if (body.action === 'connect') {
      // Saves the store and token, then tries the sales pull. A token without read_orders still
      // imports images, so a failed sales pull is reported, not fatal.
      const res = await connectSource(env, sb, lead, 'shopify', { shop: body.shop ?? '', token: body.token ?? '' });
      if (!res.ok && /\.myshopify\.com/.test(res.error ?? '')) return json({ ok: false, error: res.error }, 200);
      salesNote = res.ok ? null : res.error ?? null;
    }
    if (body.action === 'connect' || body.action === 'import') {
      const row = (await listAccess(sb, lead.id)).find((r) => r.source === 'shopify');
      if (!row?.config.shop || !row.secret_enc) return json({ error: 'Connect Shopify first: store address and token.' }, 400);
      const assets = await pullShopifyImages(row.config.shop, decryptSecret(row.secret_enc, env.LEAD_TOKEN_SECRET), key);
      const n = await saveMedia(sb, assets);
      return json({ ok: true, imported: n, salesNote }, 200);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
  return json({ error: 'Unknown action.' }, 400);
};
