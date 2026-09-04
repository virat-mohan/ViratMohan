export const prerender = false;

// Receives inbound email via Resend's Inbound feature (Svix-signed webhook)
// when a client replies to their "Your demo is ready" email. The Reply-To
// on that email is feedback+<submissionId>@<INBOUND_EMAIL_DOMAIN>, so the
// submission is identified from the `to` address, no thread/header
// matching needed.
//
// NOTE: Resend's inbound payload shape is a newer part of their API and
// may differ from what's coded here (which body field carries the plain
// text, whether `to` is a string or array, etc.) — if this 400s or 500s in
// practice, check the actual payload via the "Recent deliveries" log in
// Resend's webhook settings and adjust `extractFeedback` accordingly.

import type { APIRoute } from 'astro';
import { Webhook } from 'svix';
import { getEnv } from '../../../lib/env';
import { getDb } from '../../../lib/db';
import { reviseArtefact, fetchWebsiteSnippet } from '../../../lib/llm';
import { sendEmail } from '../../../lib/email';
import { getOrigin } from '../../../lib/http';

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const rawBody = await request.text();

  if (env.RESEND_WEBHOOK_SECRET) {
    try {
      const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
      wh.verify(rawBody, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      });
    } catch (err) {
      console.error('feedback-webhook: signature verification failed', err);
      return new Response('invalid signature', { status: 401 });
    }
  } else {
    console.warn('feedback-webhook: RESEND_WEBHOOK_SECRET not set — accepting unverified request');
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const { submissionId, feedbackText } = extractFeedback(payload);
  if (!submissionId) {
    // Not addressed to a feedback+<id>@ alias — ignore, ack receipt anyway.
    return new Response('ok (no submission id found)', { status: 200 });
  }
  if (!feedbackText) {
    return new Response('ok (empty body)', { status: 200 });
  }

  const db = getDb(env);
  const row = await db.getById(submissionId);
  if (!row) return new Response('ok (unknown submission)', { status: 200 });

  if (row.status !== 'sent' || row.feedback_round >= 1) {
    // One round of feedback only — per product rule. Let the desk know a
    // second reply came in rather than silently dropping it.
    await sendEmail(
      {
        to: env.ADMIN_NOTIFY_EMAIL,
        subject: `Extra feedback received (not auto-processed) — ${row.company || row.email}`,
        html: `<p>A reply came in for submission ${submissionId}, but it's past the one free revision round (status: ${row.status}, feedback_round: ${row.feedback_round}). Handle manually if needed.</p><p>${escapeHtml(feedbackText)}</p>`,
      },
      env
    ).catch((err) => console.error('feedback-webhook: extra-feedback notify failed', err));
    return new Response('ok (feedback round already used)', { status: 200 });
  }

  const origin = getOrigin(request);

  try {
    await db.startRevision(submissionId, feedbackText);

    const websiteSnippet = row.website ? await fetchWebsiteSnippet(row.website) : null;
    const notes = row.solution_notes;

    const result = await reviseArtefact(
      {
        problem: row.problem,
        company: row.company,
        tools: row.tools,
        websiteSnippet,
        previousProblemBreakdown: notes?.problemBreakdown ?? [],
        previousLevers: row.pnl_levers ?? [],
        previousSolutionMechanisms: notes?.solutionMechanisms ?? [],
        previousArtefactHtml: row.artefact_html ?? '',
        feedbackText,
      },
      env.ANTHROPIC_API_KEY
    );

    await db.markRevised(
      submissionId,
      result.levers,
      {
        problemBreakdown: result.problemBreakdown,
        solutionMechanisms: result.solutionMechanisms,
        artefactPlan: result.artefactPlan,
        clarifyingQuestions: result.clarifyingQuestions,
      },
      result.artefactHtml
    );

    await sendEmail(
      {
        to: env.ADMIN_NOTIFY_EMAIL,
        subject: `Revised demo ready for review — ${row.company || row.email}`,
        html: `<p>Feedback came in and the demo has been revised.</p><p><a href="${origin}/devshop/admin/${submissionId}">Review and approve →</a></p>`,
      },
      env
    ).catch((err) => console.error('feedback-webhook: revised notify failed', err));
  } catch (err) {
    console.error('feedback-webhook: revision failed', err);
    await db.markFailed(submissionId, err instanceof Error ? err.message : String(err)).catch(() => {});
  }

  return new Response('ok', { status: 200 });
};

function extractFeedback(payload: any): { submissionId: string | null; feedbackText: string | null } {
  const data = payload?.data ?? payload;
  const toRaw = data?.to;
  const toList: string[] = Array.isArray(toRaw) ? toRaw : typeof toRaw === 'string' ? [toRaw] : [];

  let submissionId: string | null = null;
  for (const addr of toList) {
    const match = /feedback\+([0-9a-f-]{36})@/i.exec(String(addr));
    if (match) {
      submissionId = match[1];
      break;
    }
  }

  const feedbackText: string | null =
    (typeof data?.text === 'string' && data.text.trim()) ||
    (typeof data?.html === 'string' && stripHtml(data.html).trim()) ||
    null;

  return { submissionId, feedbackText };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
