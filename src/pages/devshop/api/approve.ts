export const prerender = false;

import type { APIRoute } from 'astro';
import { sendEmail } from '../../../lib/email';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { getOrigin } from '../../../lib/http';

// Approve is a one-shot action, per the product rule: one round of feedback
// before build starts. Approving sends the client their demo link — it does
// not re-run the LLM or accept further revision.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) return json({ error: 'id is required' }, 400);

  const db = getDb(env);
  const row = await db.getById(id);

  if (!row) return json({ error: 'not found' }, 404);
  if (row.status !== 'demo_ready') {
    return json({ error: `cannot approve from status "${row.status}"` }, 409);
  }
  if (!row.artefact_html) return json({ error: 'no artefact generated yet' }, 409);

  const origin = getOrigin(request);
  const demoUrl = `${origin}/devshop/demo/${id}`;

  await sendEmail(
    {
      to: row.email,
      subject: `Your demo is ready — Fast Tech Dev Shop`,
      html: `
        <p>Here's the working demo for the problem you sent us${row.company ? ` at ${escapeHtml(row.company)}` : ''}:</p>
        <p><a href="${demoUrl}">${demoUrl}</a></p>
        <p>Reply to this email with one round of feedback — that's the scope for the 7-day build. No proposal, no scoping call.</p>
      `,
    },
    env
  );

  await db.markSent(id);

  return json({ ok: true, demoUrl }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
