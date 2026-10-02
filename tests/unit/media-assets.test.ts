import { describe, it, expect } from 'vitest';
import { pullShopifyImages } from '../../src/lib/media-assets';

describe('pullShopifyImages', () => {
  it('collects every product image in order, with the product title as fallback alt', async () => {
    const page = { data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
      { title: 'KORBI H4', media: { nodes: [
        { id: 'gid://shopify/MediaImage/1', alt: '', image: { url: 'https://cdn.shopify.com/a.jpg', width: 1200, height: 1200 } },
        { id: 'gid://shopify/Video/2' },
        { id: 'gid://shopify/MediaImage/3', alt: 'Box', image: { url: 'https://cdn.shopify.com/b.jpg', width: 800, height: 600 } },
      ] } },
    ] } } };
    const f = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://korbi.myshopify.com/admin/api/2025-07/graphql.json');
      expect((init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe('tok');
      return new Response(JSON.stringify(page), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await pullShopifyImages('korbi', 'tok', 'korbi', f);
    expect(out.map((a) => [a.source_id, a.alt, a.position])).toEqual([
      ['gid://shopify/MediaImage/1', 'KORBI H4', 0],
      ['gid://shopify/MediaImage/3', 'Box', 1],
    ]);
  });

  it('rejects a store address that is not myshopify.com', async () => {
    await expect(pullShopifyImages('korbi.in', 'tok', 'korbi', fetch)).rejects.toThrow(/myshopify/);
  });
});
