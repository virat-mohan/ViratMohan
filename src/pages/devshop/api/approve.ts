export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { getOrigin } from '../../../lib/http';
import { sendDemoDoneEmail } from '../../../lib/demo-email';

// The very first demo now sends automatically right after intake
// generates it (see intake.ts) — this route now only handles the ONE
// revised send after the client's feedback comes back (feedback_round 1,
// no Reply-To routing, copy says it's final).
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const { id, overrideEmail } = (await request.json().catch(() => ({}))) as {
    id?: string;
    overrideEmail?: string;
  };
  if (!id) return json({ error: 'id is required' }, 400);

  const db = getDb(env);
  const row = await db.getById(id);

  if (!row) return json({ error: 'not found' }, 404);
  if (row.status !== 'demo_ready') {
    return json({ error: `cannot approve from status "${row.status}"` }, 409);
  }
  if (!row.artefact_html) return json({ error: 'no artefact generated yet' }, 409);

  const origin = getOrigin(request);
  const { demoUrl, sentTo } = await sendDemoDoneEmail(row, origin, env, { overrideEmail });

  await db.markSent(id);

  return json({ ok: true, demoUrl, sentTo }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
