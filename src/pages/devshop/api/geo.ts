export const prerender = false;
// Tiny, deliberately narrow SSR endpoint — the ONLY thing devshop.astro
// (a fully static page, by design, for CDN speed) needs server-rendered
// help with: which country the visitor is in, so the pricing screen can
// show a regional price instead of a raw FX conversion. Reads Vercel's own
// edge geo header — no external geolocation service, no IP stored anywhere.

import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ request }) => {
  const country = request.headers.get('x-vercel-ip-country') ?? '';
  return new Response(JSON.stringify({ country }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Never cache — the response varies per visitor by IP geolocation,
      // and a shared/CDN cache here would serve one visitor's country to
      // everyone behind the same cache key.
      'Cache-Control': 'no-store',
    },
  });
};
