export const prerender = false;
// Public — same trust model as approve.ts/demo-feedback.ts (the UUID is the
// gate). Deliberately narrow: the ONLY transition this allows is
// sent -> interested, so exposing it outside the admin-protected prefix
// list can't be used to set an arbitrary stage, mark a deposit paid, etc.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { getOrigin } from '../../../lib/http';
import { sendEmail } from '../../../lib/email';

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) return json({ error: 'id is required' }, 400);

  const db = getDb(env);
  const row = await db.getById(id);
  if (!row) return json({ error: 'not found' }, 404);
  if (row.status !== 'sent') {
    // Already past this point (or not there yet) — idempotent no-op rather
    // than an error, since a client could double-click or reload.
    return json({ ok: true, status: row.status }, 200);
  }

  await db.setStage(id, 'interested');

  const origin = getOrigin(request);
  sendEmail(
    {
      to: env.ADMIN_NOTIFY_EMAIL,
      subject: `Client wants to move forward — ${row.company || row.email}`,
      html: `<p><strong>${row.company || row.email}</strong> confirmed on their demo page that they want to proceed — reach out to schedule scoping/kickoff.</p><p><a href="${origin}/devshop/admin/${id}">View in admin →</a></p>`,
    },
    env
  ).catch((err) => console.error('demo-interest: notify failed', err));

  return json({ ok: true, status: 'interested' }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
