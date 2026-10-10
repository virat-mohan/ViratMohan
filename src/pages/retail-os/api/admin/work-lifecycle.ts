export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { serviceDb } from '../../../../lib/ledger';
import { createSupabaseWorkStore } from '../../../../lib/work/db-store';
import { handleFounderLifecycle, type LifecycleBody } from '../../../../lib/ceo/founder-lifecycle';

// Founder: start, resolve, verify or close Work through the lifecycle (never delete). Admin password gate
// (middleware and again inside the handler). Service-role access stays on the server.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const store = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? createSupabaseWorkStore(serviceDb(env)) : null;
  const body = await readJson<LifecycleBody>(request);
  try {
    const r = await handleFounderLifecycle(request.headers.get('authorization'), body, { store, adminPassword: env.ADMIN_PASSWORD });
    return json(r.body, r.status);
  } catch (err) {
    console.error('work-lifecycle', err);
    return json({ error: 'The lifecycle service could not complete this request' }, 500);
  }
};
