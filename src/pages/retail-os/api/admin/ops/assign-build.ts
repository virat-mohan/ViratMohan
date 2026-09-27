export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { json, readJson } from '../../../../../lib/retail-os-http';
import { serviceDb } from '../../../../../lib/ledger';
import { seedBrandSetupTasks } from '../../../../../lib/ops-seed';

// Admin only (gated by src/middleware.ts). Virat's explicit action: put a brand's build
// tasks on the operations consultant's page. Nothing assigns these automatically.
export const POST: APIRoute = async ({ request }) => {
  const b = await readJson<{ brandName?: string; startedAt?: string }>(request);
  const name = (b?.brandName || '').trim();
  if (!name) return json({ error: 'brandName is required' }, 400);
  const started = b?.startedAt && !Number.isNaN(Date.parse(b.startedAt)) ? new Date(b.startedAt) : new Date();
  try {
    const n = await seedBrandSetupTasks(serviceDb(getEnv()) as never, name, started);
    return json({ ok: true, added: n, note: n ? `${n} build tasks assigned.` : 'Already assigned, or no operations team member is active.' }, 200);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
};
