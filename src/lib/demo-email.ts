import { sendEmail } from './email';
import type { Submission } from './db';
import type { Env } from './env';

// Sends the "your demo is ready" email to the client. Shared by the
// automatic send right after intake generates a fresh demo, and the
// manual /devshop/api/approve route used for the one-round revised demo
// after feedback comes back (that step stays a deliberate admin action,
// per the one-revision-round product rule).
export async function sendDemoDoneEmail(
  row: Submission,
  origin: string,
  env: Env,
  opts?: { overrideEmail?: string }
): Promise<{ demoUrl: string; sentTo: string }> {
  const demoUrl = `${origin}/devshop/demo/${row.id}`;
  const isFinal = row.feedback_round >= 1;

  const replyTo = !isFinal && env.INBOUND_EMAIL_DOMAIN ? `feedback+${row.id}@${env.INBOUND_EMAIL_DOMAIN}` : undefined;

  const questions = row.solution_notes?.clarifyingQuestions ?? [];
  const questionsBlock =
    questions.length > 0
      ? `<p><strong>A few questions that would sharpen the numbers</strong> (the demo currently uses industry-typical assumptions where we didn't have your real figures — answer any of these in your reply and we'll use the real number):</p>
         <ul>${questions.map((q) => `<li>${escapeHtml(q.question)}</li>`).join('')}</ul>`
      : '';

  const recipient = (opts?.overrideEmail || '').trim() || row.email;

  await sendEmail(
    {
      to: recipient,
      subject: isFinal
        ? `Your Updated Demo${row.company ? ` for ${row.company}` : ''} is ready from Fast Tech Dev Shop`
        : `Your Demo${row.company ? ` for ${row.company}` : ''} is ready from Fast Tech Dev Shop`,
      replyTo,
      html: isFinal
        ? `
        <p>Here's the updated demo, incorporating your feedback${row.company ? ` for ${escapeHtml(row.company)}` : ''}:</p>
        <p><a href="${demoUrl}">View your demo here →</a></p>
        <p>This is the version we build from. The 30-day build clock starts once your deposit is in — no further revision rounds at this stage; if anything material changes, just let us know directly.</p>
      `
        : `
        <p>Here's the working demo — and the reasoning behind it — for the problem you sent us${row.company ? ` at ${escapeHtml(row.company)}` : ''}:</p>
        <p><a href="${demoUrl}">View your demo here →</a></p>
        ${questionsBlock}
        <p>Have a change or a correction? Reply to this email — we'll fold it into one revised version, and that's the scope for the 30-day build.</p>
      `,
    },
    env
  );

  return { demoUrl, sentTo: recipient };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
