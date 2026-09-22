export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';

// Public by design — the UUID itself is the bearer token, same pattern as
// /devshop/demo/[id]. Only ever returns one application's own record.
export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return json({ error: 'Missing id' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Backend not configured' }, 503);
  }

  const db = getRetailOsDb(env);
  try {
    const app = await db.getById(id);
    if (!app) return json({ error: 'Not found' }, 404);
    return json({
      id: app.id,
      brandName: app.brand_name,
      createdAt: app.created_at,
      updatedAt: app.updated_at,
      stages: app.stages,
    }, 200);
  } catch (err) {
    console.error('retail-os status lookup failed', err);
    return json({ error: 'Lookup failed' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
