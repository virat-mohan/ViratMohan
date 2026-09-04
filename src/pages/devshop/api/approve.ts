export const prerender = false;

import type { APIRoute } from 'astro';
import { sendEmail } from '../../../lib/email';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { getOrigin } from '../../../lib/http';

// Approving sends the client their demo link. This fires twice at most,
// per the product rule of one round of feedback: once for the original
// demo (feedback_round 0 — Reply-To routes to the inbound feedback
// webhook), and once for the revised one after feedback comes back
// (feedback_round 1 — final, no Reply-To routing, copy says so explicitly).
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
  const isFinal = row.feedback_round >= 1;

  const replyTo =
    !isFinal && env.INBOUND_EMAIL_DOMAIN ? `feedback+${id}@${env.INBOUND_EMAIL_DOMAIN}` : undefined;

  const questions = row.solution_notes?.clarifyingQuestions ?? [];
  const questionsBlock =
    questions.length > 0
      ? `<p><strong>A few questions that would sharpen the numbers</strong> (the demo currently uses industry-typical assumptions where we didn't have your real figures — answer any of these in your reply and we'll use the real number):</p>
         <ul>${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>`
      : '';

  await sendEmail(
    {
      to: row.email,
      subject: isFinal ? `Your updated demo — Fast Tech Dev Shop` : `Your demo is ready — Fast Tech Dev Shop`,
      replyTo,
      html: isFinal
        ? `
        <p>Here's the updated demo, incorporating your feedback${row.company ? ` for ${escapeHtml(row.company)}` : ''}:</p>
        <p><a href="${demoUrl}">${demoUrl}</a></p>
        <p>This is the version we build from — the 7-day build starts here. No further revision rounds at this stage; if anything material changes, just let us know directly.</p>
      `
        : `
        <p>Here's the working demo — and the reasoning behind it — for the problem you sent us${row.company ? ` at ${escapeHtml(row.company)}` : ''}:</p>
        <p><a href="${demoUrl}">${demoUrl}</a></p>
        ${questionsBlock}
        <p>Reply directly to this email with one round of feedback — that's the scope for the 7-day build. No proposal, no scoping call.</p>
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
