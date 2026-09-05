export const prerender = false;
// Admin-only. Same protection gap as /devshop/admin/* — gate this path too.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import { suggestFrameworkDetails } from '../../../lib/llm';

type Body =
  | {
      action: 'add';
      name: string;
      source: string;
      business_function: string;
      when_to_use: string;
      link?: string;
      problem_archetypes?: string;
      ideal_use_cases?: string;
      required_conditions?: string;
      required_evidence?: string;
      contraindications?: string;
      expected_intervention_types?: string;
      applicable_business_functions?: string;
      applicable_pnl_levers?: string;
      expert_notes?: string;
    }
  | { action: 'setActive'; id: string; active: boolean }
  | { action: 'suggest'; name: string; hint?: string }
  | { action: 'markReviewed'; id: string; reviewedBy: string };

function toList(s: string | undefined): string[] {
  return (s || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !body.action) return json({ error: 'action is required' }, 400);

  const db = getDb(env);
  try {
    if (body.action === 'add') {
      if (!body.name?.trim() || !body.source?.trim() || !body.when_to_use?.trim()) {
        return json({ error: 'name, source, and when_to_use are required' }, 400);
      }
      await db.addFramework({
        name: body.name.trim(),
        source: body.source.trim(),
        business_function: body.business_function,
        when_to_use: body.when_to_use.trim(),
        link: body.link?.trim() || null,
        problem_archetypes: toList(body.problem_archetypes),
        ideal_use_cases: toList(body.ideal_use_cases),
        required_conditions: toList(body.required_conditions),
        required_evidence: toList(body.required_evidence),
        contraindications: toList(body.contraindications),
        expected_intervention_types: toList(body.expected_intervention_types),
        applicable_business_functions: toList(body.applicable_business_functions),
        applicable_pnl_levers: toList(body.applicable_pnl_levers),
        expert_notes: body.expert_notes?.trim() || null,
      });
    } else if (body.action === 'setActive') {
      await db.setFrameworkActive(body.id, body.active);
    } else if (body.action === 'markReviewed') {
      if (!body.reviewedBy?.trim()) return json({ error: 'reviewedBy is required' }, 400);
      await db.markFrameworkReviewed(body.id, body.reviewedBy.trim());
    } else if (body.action === 'suggest') {
      if (!body.name?.trim()) return json({ error: 'name is required' }, 400);
      const suggestion = await suggestFrameworkDetails(body.name.trim(), body.hint?.trim() || null, env.ANTHROPIC_API_KEY);
      return json({ ok: true, suggestion }, 200);
    } else {
      return json({ error: 'unknown action' }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
