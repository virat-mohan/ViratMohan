import type { SupabaseClient } from '@supabase/supabase-js';
import { SHOPIFY_API_VERSION, normalizeShop, isValidShopDomain } from './lead-connectors';

// Retail OS · Media assets (core module). A brand's image library, imported from its Shopify
// store with the read-only custom-app token saved on the brand's lead (lead_access, encrypted).

export type MediaAsset = {
  id?: string; brand_key: string; source: 'shopify' | 'upload' | 'drive'; source_id: string; url: string;
  alt: string | null; width: number | null; height: number | null; product_title: string | null; position: number;
};

type Fetch = typeof fetch;
const PRODUCTS_QUERY = `
query Media($cursor: String) {
  products(first: 50, after: $cursor, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes { title media(first: 50) { nodes { ... on MediaImage { id alt image { url width height } } } } }
  }
}`;

type Node = { title: string; media: { nodes: ({ id?: string; alt?: string | null; image?: { url: string; width: number | null; height: number | null } | null })[] } };

/** Every product image in the store, in product order. Needs the read_products scope. */
export async function pullShopifyImages(shop: string, token: string, brandKey: string, f: Fetch = fetch, maxPages = 20): Promise<MediaAsset[]> {
  const domain = normalizeShop(shop);
  if (!isValidShopDomain(domain)) throw new Error('Shop must be a *.myshopify.com domain');
  const out: MediaAsset[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const res = await f(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: PRODUCTS_QUERY, variables: { cursor } }),
    });
    if (!res.ok) throw new Error(`Shopify ${res.status}: check the store address and that the app has read_products.`);
    const r = (await res.json()) as { data?: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Node[] } }; errors?: { message: string }[] };
    if (r.errors?.length || !r.data) throw new Error(`Shopify: ${r.errors?.map((e) => e.message).join('; ') ?? 'no data'}`);
    for (const p of r.data.products.nodes) {
      for (const m of p.media.nodes) {
        if (!m.id || !m.image?.url) continue;
        out.push({ brand_key: brandKey, source: 'shopify', source_id: m.id, url: m.image.url, alt: m.alt || p.title, width: m.image.width ?? null, height: m.image.height ?? null, product_title: p.title, position: out.length });
      }
    }
    if (!r.data.products.pageInfo.hasNextPage) break;
    cursor = r.data.products.pageInfo.endCursor;
  }
  return out;
}

export async function listMedia(sb: SupabaseClient, brandKey: string): Promise<MediaAsset[]> {
  const { data, error } = await sb.from('retail_os_media_assets').select('*').eq('brand_key', brandKey).order('position');
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaAsset[];
}

export async function saveMedia(sb: SupabaseClient, rows: MediaAsset[]): Promise<number> {
  if (!rows.length) return 0;
  const now = new Date().toISOString();
  const { error } = await sb.from('retail_os_media_assets').upsert(rows.map((r) => ({ ...r, updated_at: now })), { onConflict: 'brand_key,source,source_id' });
  if (error) throw new Error(error.message);
  return rows.length;
}
