export const prerender = false;
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { getFaqDb } from '../../../../lib/retail-os-faq';

// Public: answers Virat has published from the FAQ inbox.
export const GET: APIRoute = async () => {
  try {
    const items = await getFaqDb(getEnv()).published();
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('faq published failed', err);
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
};
