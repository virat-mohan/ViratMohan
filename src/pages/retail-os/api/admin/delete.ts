export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';

// Gated by src/middleware.ts ('/retail-os/api/admin' is a protected prefix).
export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const id = (body.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const env = getEnv();
  const db = getRetailOsDb(env);
  try {
    await db.deleteById(id);
    return json({ ok: true }, 200);
  } catch (err) {
    console.error('retail-os admin delete failed', err);
    return json({ error: 'Delete failed' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
