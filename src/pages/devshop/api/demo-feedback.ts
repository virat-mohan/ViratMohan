export const prerender = false;
// Public — the client calls this directly from /devshop/demo/[id], the same
// trust model as /devshop/api/approve (knowledge of the submission's UUID
// is the only gate, same as every client-facing devshop route). NOT in the
// admin-protected prefix list on purpose.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { getOrigin } from '../../../lib/http';
import { sendEmail } from '../../../lib/email';
import { runRevision } from '../../../lib/revision';
import { shouldProcessFeedback } from '../../../lib/feedback-parsing';

type Body = {
  id: string;
  answers?: { question: string; answer: string }[];
  additionalFeedback?: string;
};

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.id) return json({ error: 'id is required' }, 400);

  const db = getDb(env);
  const row = await db.getById(body.id);
  if (!row) return json({ error: 'not found' }, 404);
  if (!row.artefact_html) return json({ error: 'no demo generated yet' }, 409);
  if (!shouldProcessFeedback(row)) {
    return json({ error: 'feedback is not available for this submission right now' }, 409);
  }

  const answers = (body.answers ?? []).filter((a) => a.answer?.trim());
  const additional = (body.additionalFeedback || '').trim();
  if (answers.length === 0 && !additional) {
    return json({ error: 'answer at least one question or add feedback' }, 400);
  }

  const feedbackParts = [];
  if (answers.length > 0) {
    feedbackParts.push(
      'Answers to clarifying questions:\n' + answers.map((a) => `- ${a.question}\n  ${a.answer.trim()}`).join('\n')
    );
  }
  if (additional) feedbackParts.push(`Additional feedback: ${additional}`);
  const feedbackText = feedbackParts.join('\n\n');

  const result = await runRevision(row, feedbackText, env);
  if (!result.success) {
    return json({ error: 'Something went wrong while revising your demo — please try again.' }, 500);
  }

  // The client is already on the page and will see the revised version
  // immediately (no email round-trip needed) — this fully replaces the
  // admin-approval gate for the on-site path. finalize the status the same
  // way /devshop/api/approve would for the email path.
  await db.markSent(body.id);

  const origin = getOrigin(request);
  sendEmail(
    {
      to: env.ADMIN_NOTIFY_EMAIL,
      subject: `Revised demo — client submitted feedback on-site — ${row.company || row.email}`,
      html: `<p>The client answered clarifying questions / left feedback directly on their demo page, and the revised version was generated and shown to them automatically.</p><p><a href="${origin}/devshop/admin/${body.id}">View in admin →</a></p>`,
    },
    env
  ).catch((err) => console.error('demo-feedback: notify failed', err));

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
