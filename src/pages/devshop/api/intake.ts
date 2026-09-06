export const prerender = false;

import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { classifyAndBuild, fetchWebsiteSnippet, resolveFrameworkSelections, resolveAgentSequence } from '../../../lib/llm';
import { sendEmail } from '../../../lib/email';
import { getDb, type SolutionNotes } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { getOrigin } from '../../../lib/http';
import { sendDemoDoneEmail } from '../../../lib/demo-email';

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();

  let body: {
    problem?: string; company?: string; industry?: string; website?: string; tools?: string; email?: string; preferredFramework?: string;
    // Set only when the client came in through a vertical page's clickable
    // "common use cases" list (e.g. /devshop/restaurants) rather than free
    // text. usecaseId is stable per button; label/businessFunction are only
    // used to register the row the very first time this use case is ever hit.
    usecaseId?: string; usecaseVertical?: string; usecaseLabel?: string; usecaseBusinessFunction?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const problem = (body.problem || '').trim();
  const email = (body.email || '').trim();
  const company = (body.company || '').trim() || null;
  const industry = (body.industry || '').trim() || null;
  const website = (body.website || '').trim() || null;
  const tools = (body.tools || '').trim() || null;
  const preferredFramework = (body.preferredFramework || '').trim() || null;
  const usecaseId = (body.usecaseId || '').trim() || null;

  if (!problem || !email) {
    return json({ error: 'problem and email are required' }, 400);
  }
  if (problem.length < 30) {
    // Mirrors the client-side wizard's minlength gate — a one-word or
    // single-topic problem statement ("Customer communication") isn't
    // enough for the diagnosis step to find a real root cause. Enforced
    // server-side too since the client check can be bypassed.
    return json({ error: 'Give us a bit more to work with — describe what\'s actually going wrong, not just a topic.' }, 400);
  }

  const origin = getOrigin(request);
  const db = getDb(env);

  // Duplicate-submission guard (brief §25) — catches the common double-
  // click/resubmit case: same email + same problem text within 60s. Return
  // the existing submission instead of paying for a second full generation.
  const duplicate = await db.findRecentDuplicateSubmission(email, problem, 60);
  if (duplicate) {
    const demoUrl = duplicate.artefact_html ? `${origin}/devshop/demo/${duplicate.id}` : null;
    return json({ id: duplicate.id, status: duplicate.status === 'failed' ? 'failed' : 'demo_ready', demoUrl }, 200);
  }

  const id = crypto.randomUUID();
  await db.insertSubmission({ id, problem, company, industry, website, tools, email });

  // Use-case template hit — count it regardless of whether this run ends up
  // cached or freshly generated (that's the admin-visible "how often has
  // this specific use case been picked" number). Best-effort: a counting
  // failure must never block the actual demo generation.
  if (usecaseId) {
    await db
      .recordUsecaseHit({
        id: usecaseId,
        vertical: (body.usecaseVertical || '').trim() || 'unknown',
        businessFunction: (body.usecaseBusinessFunction || '').trim() || 'Unspecified',
        label: (body.usecaseLabel || '').trim() || problem.slice(0, 80),
        problemText: problem,
      })
      .catch((err) => console.error('intake: recordUsecaseHit failed', err));
  }
  const cachedUsecase = usecaseId ? await db.getUsecaseTemplate(usecaseId).catch(() => null) : null;
  const usecaseCacheHit = !!(cachedUsecase && cachedUsecase.cached_artefact_html);

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
  let demoUrl: string | null = null;
  try {
    let artefactBlocked: boolean;

    if (usecaseCacheHit && cachedUsecase) {
      // Fast path: a previous click on this exact use case already produced
      // a validated result — reuse it verbatim instead of paying for another
      // Claude classify+build call. This is the whole point of caching by
      // use case: repeat visitors to a vertical page's common-problems list
      // get an instant, free demo instead of a fresh ~60-90s generation.
      artefactBlocked = false;
      await db.markDemoReady(id, cachedUsecase.cached_pnl_levers ?? [], cachedUsecase.cached_solution_notes as SolutionNotes, cachedUsecase.cached_artefact_html!);
      await db.logTransition(id, 'received', 'demo_ready', 'system', `Reused cached result for use case "${usecaseId}"`);
      await db.recordGeneration({
        submissionId: id,
        kind: 'classify',
        model: 'cached',
        promptVersion: 'usecase-cache',
        status: 'success',
        attempts: 0,
        durationMs: 0,
        errorMessage: null,
        artefactBlocked: false,
      });
    } else {
      const websiteSnippet = website ? await fetchWebsiteSnippet(website) : null;
      const frameworkLibrary = await db.listActiveFrameworks();
      const agentLibrary = await db.listActiveAiAgents().catch((err) => {
        console.error('listActiveAiAgents failed (migration 0015 may not be applied yet) — proceeding with an empty agent library', err);
        return [];
      });
      const pastFrameworkUsage = industry ? await db.listPastFrameworkUsageByIndustry(industry) : [];
      const result = await classifyAndBuild(
        { problem, company, industry, tools, websiteSnippet, frameworkLibrary, agentLibrary, preferredFramework, pastFrameworkUsage },
        env.ANTHROPIC_API_KEY
      );
      await db.recordGeneration({
        submissionId: id,
        kind: 'classify',
        model: result.generationMeta.model,
        promptVersion: result.generationMeta.promptVersion,
        status: result.generationMeta.status,
        attempts: result.generationMeta.attempts,
        durationMs: result.generationMeta.durationMs,
        errorMessage: result.generationMeta.errorMessage,
        artefactBlocked: result.artefactValidations.some((v) => v.status === 'block'),
      });
      const notes: SolutionNotes = {
        problemBreakdown: result.problemBreakdown,
        frameworkSelections: resolveFrameworkSelections(result.frameworkSelections, frameworkLibrary),
        solutionMechanisms: result.solutionMechanisms.map(({ agent_sequence, ...m }) => ({
          ...m,
          agentSequence: resolveAgentSequence(agent_sequence, agentLibrary),
        })),
        validations: result.validations,
        artefactValidations: result.artefactValidations,
        artefactPlan: result.artefactPlan,
        clarifyingQuestions: result.clarifyingQuestions,
      };
      await db.markDemoReady(id, result.levers, notes, result.artefactHtml);
      await db.logTransition(id, 'received', 'demo_ready', 'system', 'Classification complete');
      artefactBlocked = result.artefactValidations.some((v) => v.status === 'block');

      // First real run for this use case — cache it so every future click
      // reuses this result instead of generating again. Never cache a
      // blocked artefact (it failed its own self-audit — see Step 9).
      if (usecaseId && !artefactBlocked) {
        await db
          .cacheUsecaseResult(usecaseId, id, result.levers, notes, result.artefactHtml)
          .catch((err) => console.error('intake: cacheUsecaseResult failed', err));
      }
    }

    if (artefactBlocked) {
      // The artefact self-audit (Step 9) flagged a real defect — e.g. the
      // before/after numbers never actually change, or there's no Run
      // control. Auto-sending a demo we already know is broken defeats the
      // point of validating it. Skip the send, leave status at demo_ready
      // (the client's browser still lands on the demo page, since it's not
      // hidden at that status), and flag the desk urgently instead of the
      // routine "demo sent" notice.
      demoUrl = `${origin}/devshop/demo/${id}`;
      waitUntil(
        sendEmail(
          {
            to: env.ADMIN_NOTIFY_EMAIL,
            subject: `⚠ Artefact validation blocked auto-send — ${company || email}`,
            html: `<p>The generated artefact for <strong>${escapeHtml(
              company || email
            )}</strong> failed its own self-check and was NOT auto-sent — review before approving.</p><p><a href="${origin}/devshop/admin/${id}">Review in admin →</a></p>`,
          },
          env
        ).catch((err) => console.error('intake: artefact-blocked notify failed', err))
      );
    } else {
      // The demo now sends to the client immediately, no admin approval gate
      // in between — the client's own browser also redirects straight to it
      // (see devshop.astro), so both need the same URL at the same moment.
      // Kept in its own try/catch: a Resend hiccup here must not overwrite a
      // perfectly good demo_ready row with "failed" — if this fails, the row
      // simply stays at demo_ready and /devshop/api/approve remains a manual
      // retry path (its own gate is `status === 'demo_ready'`).
      try {
        const row = await db.getById(id);
        if (row) {
          const sent = await sendDemoDoneEmail(row, origin, env);
          await db.markSent(id);
          await db.logTransition(id, 'demo_ready', 'sent', 'system', 'Auto-sent to client');
          demoUrl = sent.demoUrl;
        }
      } catch (err) {
        console.error('intake: auto-send failed, leaving row at demo_ready for manual retry', err);
        demoUrl = `${origin}/devshop/demo/${id}`;
      }

      waitUntil(
        sendEmail(
          {
            to: env.ADMIN_NOTIFY_EMAIL,
            subject: `Demo sent to client${company ? ` — ${company}` : ''}`,
            html: `<p>The demo for <strong>${escapeHtml(
              company || email
            )}</strong> was generated and sent automatically.</p><p><a href="${origin}/devshop/admin/${id}">View in admin →</a></p>`,
          },
          env
        ).catch((err) => console.error('intake: demo-sent notify failed', err))
      );
    }
  } catch (err) {
    console.error('intake: classification failed', err);
    status = 'failed';
    const meta = (err as { generationMeta?: import('../../../lib/llm').GenerationMeta })?.generationMeta;
    if (meta) {
      await db
        .recordGeneration({
          submissionId: id,
          kind: 'classify',
          model: meta.model,
          promptVersion: meta.promptVersion,
          status: meta.status,
          attempts: meta.attempts,
          durationMs: meta.durationMs,
          errorMessage: meta.errorMessage,
        })
        .catch(() => {});
    }
    await db.markFailed(id, err instanceof Error ? err.message : String(err)).catch(() => {});
  }

  return json({ id, status, demoUrl }, 201);
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
