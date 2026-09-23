export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { createPlanForApplication } from '../../../../lib/retail-os-prepare';

// Gated by src/middleware.ts ('/retail-os/api/admin' is a protected prefix).
export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string; extraNotes?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const id = (body.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 503);

  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Application not found' }, 404);

  try {
    const planId = await createPlanForApplication(db, app, env.ANTHROPIC_API_KEY, body.extraNotes || '');
    return json({ id: planId }, 201);
  } catch (err) {
    console.error('retail-os generate-plan failed', err);
    return json({ error: err instanceof Error ? err.message : 'Plan generation failed' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
