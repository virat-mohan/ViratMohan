export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';

// The brand picks one of its design directions from its own page. Public like
// the tracker (the application UUID is the bearer token); the chosen option
// must belong to this application.
export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  const body = await readJson<{ designId?: string }>(request);
  if (!id || !body?.designId) return json({ error: 'Missing id' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Not found' }, 404);
  if (app.build_started_at) return json({ error: 'Your build has started; ask Virat to change the design direction.' }, 409);

  const ok = await db.chooseDesignOption(id, body.designId);
  if (!ok) return json({ error: 'That design option was not found.' }, 404);

  // Choosing a direction is real progress on the build — reflect it on the
  // checklist immediately rather than leaving "Design direction proposed"
  // sitting at pending until someone in admin updates it by hand.
  await db.setStageStatus(id, 'design', 'done').catch((err) => console.error('retail-os design-choice setStageStatus failed', err));

  const next = app.agreement
    ? 'Saved. Your build will use this direction.'
    : 'Saved. Next: review and sign your commercial terms below to start the 7-day build.';
  return json({ ok: true, next }, 200);
};
