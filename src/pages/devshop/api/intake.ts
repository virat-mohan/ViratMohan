export const prerender = false;

import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { classifyAndBuild, fetchWebsiteSnippet } from '../../../lib/llm';
import { sendEmail } from '../../../lib/email';
import { getDb } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const env = import.meta.env;

  let body: { problem?: string; company?: string; website?: string; tools?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const problem = (body.problem || '').trim();
  const email = (body.email || '').trim();
  const company = (body.company || '').trim() || null;
  const website = (body.website || '').trim() || null;
  const tools = (body.tools || '').trim() || null;

  if (!problem || !email) {
    return json({ error: 'problem and email are required' }, 400);
  }

  const id = crypto.randomUUID();
  const origin = new URL(request.url).origin;
  const db = getDb(env);

  await db.insertSubmission({ id, problem, company, website, tools, email });

  // Notify the desk immediately — don't block the client's response on this.
  const notify = sendEmail(
    {
      to: env.ADMIN_NOTIFY_EMAIL,
      subject: `New devshop query${company ? ` — ${company}` : ''}`,
      html: `
        <p><strong>Problem:</strong> ${escapeHtml(problem)}</p>
        ${company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : ''}
        ${tools ? `<p><strong>Tools in use:</strong> ${escapeHtml(tools)}</p>` : ''}
        <p><strong>Reply-to:</strong> ${escapeHtml(email)}</p>
        <p><a href="${origin}/devshop/admin/${id}">Review in admin →</a></p>
      `,
    },
    env
  ).catch((err) => console.error('intake: admin notify failed', err));

  // Classify + generate the demo artefact in the background so the client
  // gets an immediate response; the admin page polls status.
  const classify = (async () => {
    try {
      const websiteSnippet = website ? await fetchWebsiteSnippet(website) : null;
      const result = await classifyAndBuild(
        { problem, company, tools, websiteSnippet },
        env.ANTHROPIC_API_KEY
      );
      await db.markDemoReady(id, result.levers, result.artefactHtml);

      await sendEmail(
        {
          to: env.ADMIN_NOTIFY_EMAIL,
          subject: `Demo ready for review${company ? ` — ${company}` : ''}`,
          html: `<p>The demo for <strong>${escapeHtml(
            company || email
          )}</strong> is ready.</p><p><a href="${origin}/devshop/admin/${id}">Review and approve →</a></p>`,
        },
        env
      ).catch((err) => console.error('intake: demo-ready notify failed', err));
    } catch (err) {
      console.error('intake: classification failed', err);
      await db.markFailed(id, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
  })();

  waitUntil(Promise.all([notify, classify]));

  return json({ id, status: 'received' }, 201);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
