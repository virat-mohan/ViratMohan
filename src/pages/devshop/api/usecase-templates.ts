export const prerender = false;
// Admin-only (see PROTECTED_PREFIXES in ../../../lib/admin-auth) — lets an
// admin force a stale cached use-case result to regenerate on its next
// click, e.g. after the framework library changes in a way that would
// affect it.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  let body: { action?: string; id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const id = (body.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const db = getDb(env);
  if (body.action === 'invalidate') {
    await db.invalidateUsecaseCache(id);
    return json({ ok: true }, 200);
  }
  return json({ error: 'Unknown action' }, 400);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
