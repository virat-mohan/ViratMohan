export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { sectionsFor, cleanSectionAnswers } from '../../../../lib/retail-os-setup';
import { json, readJson } from '../../../../lib/retail-os-http';

// Saves one section of the step-by-step setup questions. Only sections that
// apply to this brand are accepted, and only their defined fields are kept.
export const POST: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return json({ error: 'Missing id' }, 400);
  const body = await readJson<{ section?: string; answers?: Record<string, unknown> }>(request);
  if (!body?.section || !body.answers || typeof body.answers !== 'object') return json({ error: 'section and answers are required' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Not found' }, 404);
  if (!app.agreement) return json({ error: 'Setup opens once your terms are signed.' }, 409);

  const section = sectionsFor(app).find((s) => s.key === body.section);
  if (!section) return json({ error: 'Unknown section' }, 400);

  const answers = cleanSectionAnswers(section, body.answers);
  if (Object.keys(answers).length === 0) return json({ error: 'Answer at least one question in this section.' }, 400);

  await db.saveSetupSection(id, section.key, answers);
  return json({ ok: true }, 200);
};
