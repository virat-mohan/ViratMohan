export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { serviceDb } from '../../../../lib/ledger';
import { createSupabaseWorkStore } from '../../../../lib/work/db-store';
import { handleFounderInput, type FounderRequestBody } from '../../../../lib/ceo/founder-service';

// Founder Command Centre → CEO runtime. Admin password gate (middleware and again inside the handler).
// Service-role access stays on the server. Nothing here sends, deploys, spends or contacts anyone.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const store = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createSupabaseWorkStore(serviceDb(env)) : null;
  const body = await readJson<FounderRequestBody>(request);
  try {
    const r = await handleFounderInput(request.headers.get('authorization'), body, { store, adminPassword: env.ADMIN_PASSWORD });
    return json(r.body, r.status);
  } catch (err) {
    console.error('ceo-input', err);
    return json({ error: 'The CEO runtime could not complete this request' }, 500);
  }
};
