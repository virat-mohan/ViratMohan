export const prerender = false;

import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { classifyAndBuild, fetchWebsiteSnippet, resolveFrameworkSelections } from '../../../lib/llm';
import { sendEmail } from '../../../lib/email';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { getOrigin } from '../../../lib/http';

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();

  let body: { problem?: string; company?: string; website?: string; tools?: string; email?: string; preferredFramework?: string };
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
  const preferredFramework = (body.preferredFramework || '').trim() || null;

  if (!problem || !email) {
    return json({ error: 'problem and email are required' }, 400);
  }

  const id = crypto.randomUUID();
  const origin = getOrigin(request);
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

  waitUntil(notify);

  // Classify + generate the demo artefact SYNCHRONOUSLY. This is slow (a
  // forced multi-step reasoning call plus a full HTML artefact), but
  // Vercel serverless functions aren't guaranteed to keep running true
  // background work after the response is sent unless Fluid Compute is on
  // — awaiting here is what makes this reliable regardless of that setting.
  // maxDuration is raised in astro.config.mjs to give this room to run.
  let status: 'demo_ready' | 'failed' = 'demo_ready';
  try {
    const websiteSnippet = website ? await fetchWebsiteSnippet(website) : null;
    const frameworkLibrary = await db.listActiveFrameworks();
    const result = await classifyAndBuild(
      { problem, company, tools, websiteSnippet, frameworkLibrary, preferredFramework },
      env.ANTHROPIC_API_KEY
    );
    await db.markDemoReady(
      id,
      result.levers,
      {
        problemBreakdown: result.problemBreakdown,
        frameworkSelections: resolveFrameworkSelections(result.frameworkSelections, frameworkLibrary),
        solutionMechanisms: result.solutionMechanisms,
        artefactPlan: result.artefactPlan,
        clarifyingQuestions: result.clarifyingQuestions,
      },
      result.artefactHtml
    );

    waitUntil(
      sendEmail(
        {
          to: env.ADMIN_NOTIFY_EMAIL,
          subject: `Demo ready for review${company ? ` — ${company}` : ''}`,
          html: `<p>The demo for <strong>${escapeHtml(
            company || email
          )}</strong> is ready.</p><p><a href="${origin}/devshop/admin/${id}">Review and approve →</a></p>`,
        },
        env
      ).catch((err) => console.error('intake: demo-ready notify failed', err))
    );
  } catch (err) {
    console.error('intake: classification failed', err);
    status = 'failed';
    await db.markFailed(id, err instanceof Error ? err.message : String(err)).catch(() => {});
  }

  return json({ id, status }, 201);
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
