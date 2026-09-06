export const prerender = false;
// Admin-only — protected by /devshop/api/delete-submission in PROTECTED_PREFIXES.
// Hard delete, used to clear dev/test submissions out of the admin queue.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return json({ error: 'id is required' }, 400);

  try {
    await getDb(env).deleteSubmission(body.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
