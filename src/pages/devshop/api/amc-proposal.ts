export const prerender = false;
// Admin-only — protected by src/middleware.ts.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { estimateAmcResourceHours, estimateImplementationHours } from '../../../lib/llm';
import { calculateAmcPricing, type AmcSolutionProfile, type MechanismType, type AutomationLevel, type DecisionCriticality } from '../../../lib/amc';

type Body = {
  id: string;
  domain: string;
  mechanism_type: MechanismType;
  workflow_count: number;
  integration_count: number;
  automation_level: AutomationLevel;
  decision_criticality: DecisionCriticality;
};

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.id || !body.domain?.trim()) return json({ error: 'id and domain are required' }, 400);

  const db = getDb(env);
  try {
    const row = await db.getById(body.id);
    if (!row) return json({ error: 'submission not found' }, 404);

    const problemBreakdown = row.solution_notes?.problemBreakdown ?? [];
    const frameworkSelections = row.solution_notes?.frameworkSelections ?? [];
    const businessFunction = problemBreakdown[0]?.business_function ?? 'Efficiency / Operations';
    const frameworkName = frameworkSelections[0]?.framework_name ?? 'No established framework directly applies';
    const problemType = problemBreakdown[0]?.root_cause ?? row.problem.slice(0, 60);

    const profile: AmcSolutionProfile = {
      business_function: businessFunction,
      domain: body.domain.trim(),
      problem_type: problemType,
      framework_name: frameworkName,
      mechanism_type: body.mechanism_type,
      workflow_count: body.workflow_count,
      integration_count: body.integration_count,
      automation_level: body.automation_level,
      decision_criticality: body.decision_criticality,
    };

    const { estimate, meta: amcMeta } = await estimateAmcResourceHours(profile, env.ANTHROPIC_API_KEY);
    const rateBenchmarks = await db.listActiveAmcRates();
    const recommendation = calculateAmcPricing(profile, estimate, rateBenchmarks);

    await db.saveAmcProposal(body.id, profile, estimate, recommendation);
    await db.recordGeneration({
      submissionId: body.id,
      kind: 'amc_estimate',
      model: amcMeta.model,
      promptVersion: amcMeta.promptVersion,
      status: amcMeta.status,
      attempts: amcMeta.attempts,
      durationMs: amcMeta.durationMs,
      errorMessage: amcMeta.errorMessage,
    });

    // One source of truth (brief §56): the implementation (one-time build)
    // estimate is generated from the same solution profile, at the same
    // moment, so the internal pricing and the customer-facing capacity
    // disclosure can never silently drift apart.
    let implementationEstimate = null;
    try {
      const { estimate: implEstimate, meta: implMeta } = await estimateImplementationHours(profile, env.ANTHROPIC_API_KEY);
      await db.saveImplementationEstimate(body.id, implEstimate);
      await db.recordGeneration({
        submissionId: body.id,
        kind: 'implementation_estimate',
        model: implMeta.model,
        promptVersion: implMeta.promptVersion,
        status: implMeta.status,
        attempts: implMeta.attempts,
        durationMs: implMeta.durationMs,
        errorMessage: implMeta.errorMessage,
      });
      implementationEstimate = implEstimate;
    } catch (err) {
      console.error('amc-proposal: implementation estimate failed, AMC estimate still saved', err);
    }

    return json({ ok: true, profile, estimate, recommendation, implementationEstimate }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
