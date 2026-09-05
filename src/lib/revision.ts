import { getDb, type Submission } from './db';
import { reviseArtefact, fetchWebsiteSnippet, resolveFrameworkSelections, resolveAgentSequence } from './llm';
import type { Env } from './env';

// Shared revision core — runs the one free feedback round through the same
// reviseArtefact pipeline regardless of where the feedback came from (the
// inbound-email webhook, or the on-site feedback form). Synchronous, like
// the original classify+build call: this can take 60-90s, so the caller is
// expected to either await it inline (on-site) or accept the delay
// (webhook, where the client isn't waiting on the HTTP response).
export async function runRevision(
  row: Submission,
  feedbackText: string,
  env: Env
): Promise<{ success: true } | { success: false; error: string }> {
  const db = getDb(env);
  try {
    await db.startRevision(row.id, feedbackText);

    const websiteSnippet = row.website ? await fetchWebsiteSnippet(row.website) : null;
    const notes = row.solution_notes;
    const frameworkLibrary = await db.listActiveFrameworks();
    const agentLibrary = await db.listActiveAiAgents();
    const pastFrameworkUsage = row.industry ? await db.listPastFrameworkUsageByIndustry(row.industry) : [];

    const result = await reviseArtefact(
      {
        problem: row.problem,
        company: row.company,
        industry: row.industry,
        tools: row.tools,
        websiteSnippet,
        frameworkLibrary,
        agentLibrary,
        preferredFramework: null,
        pastFrameworkUsage,
        previousProblemBreakdown: notes?.problemBreakdown ?? [],
        previousFrameworkSelections: notes?.frameworkSelections ?? [],
        previousLevers: row.pnl_levers ?? [],
        previousSolutionMechanisms: notes?.solutionMechanisms ?? [],
        previousArtefactHtml: row.artefact_html ?? '',
        feedbackText,
      },
      env.ANTHROPIC_API_KEY
    );

    await db.markRevised(
      row.id,
      result.levers,
      {
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
      },
      result.artefactHtml
    );
    await db.recordGeneration({
      submissionId: row.id,
      kind: 'revise',
      model: result.generationMeta.model,
      promptVersion: result.generationMeta.promptVersion,
      status: result.generationMeta.status,
      attempts: result.generationMeta.attempts,
      durationMs: result.generationMeta.durationMs,
      errorMessage: result.generationMeta.errorMessage,
      artefactBlocked: result.artefactValidations.some((v) => v.status === 'block'),
    });

    return { success: true };
  } catch (err) {
    console.error('runRevision failed', err);
    const message = err instanceof Error ? err.message : String(err);
    const meta = (err as { generationMeta?: import('./llm').GenerationMeta })?.generationMeta;
    if (meta) {
      await db
        .recordGeneration({
          submissionId: row.id,
          kind: 'revise',
          model: meta.model,
          promptVersion: meta.promptVersion,
          status: meta.status,
          attempts: meta.attempts,
          durationMs: meta.durationMs,
          errorMessage: meta.errorMessage,
        })
        .catch(() => {});
    }
    // Restore the pre-revision status (never "failed") — the original
    // artefact/solution_notes were never touched by a failed attempt, so
    // the client should keep seeing their still-good original demo rather
    // than a dead page.
    await db.revertRevisionFailure(row.id, message, row.status).catch(() => {});
    return { success: false, error: message };
  }
}
