export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb, type StageStatus } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';

// Gated by src/middleware.ts (see admin-auth.ts PROTECTED_PREFIXES —
// '/retail-os/api/admin' is included there).
export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string; stageKey?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const id = (body.id || '').trim();
  const stageKey = (body.stageKey || '').trim();
  const status = body.status as StageStatus;

  if (!id || !stageKey || !['pending', 'done', 'skipped'].includes(status)) {
    return json({ error: 'id, stageKey and a valid status are required' }, 400);
  }

  const env = getEnv();
  const db = getRetailOsDb(env);
  try {
    await db.setStageStatus(id, stageKey, status);
    return json({ ok: true }, 200);
  } catch (err) {
    console.error('retail-os admin update-stage failed', err);
    return json({ error: 'Update failed' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
