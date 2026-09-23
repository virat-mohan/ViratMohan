export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { createPlanForApplication, createDesignForApplication } from '../../../../lib/retail-os-prepare';
import { json } from '../../../../lib/retail-os-http';

// Called by the founder's tracker the first time it opens without a forecast
// or design direction. Public like the tracker itself (the UUID is the bearer
// token), so it is guarded against repeat spend: one run per application per
// 10 minutes, a platform-wide hourly cap, and it never regenerates something
// that already exists.
const HOURLY_CAP = 30;

export const POST: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return json({ status: 'error', error: 'Missing id' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ status: 'error', error: 'Backend not configured' }, 503);
  if (!env.ANTHROPIC_API_KEY) return json({ status: 'unavailable' }, 200);

  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ status: 'error', error: 'Not found' }, 404);

  const [plan, design] = await Promise.all([db.getLatestBusinessPlan(id), db.getLatestDesignDirection(id)]);
  if (plan && design) return json({ status: 'ready' }, 200);

  const recent = await db.countPrepsSince(new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent >= HOURLY_CAP) return json({ status: 'queued' }, 200);

  const claimed = await db.claimPrep(id);
  if (!claimed) return json({ status: 'preparing' }, 200);

  const results = await Promise.allSettled([
    plan ? Promise.resolve('exists') : createPlanForApplication(db, app, env.ANTHROPIC_API_KEY),
    design ? Promise.resolve('exists') : createDesignForApplication(db, app, env.ANTHROPIC_API_KEY),
  ]);
  const failures = results
    .map((r, i) => (r.status === 'rejected' ? `${i === 0 ? 'forecast' : 'design'}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}` : null))
    .filter(Boolean) as string[];

  if (failures.length) {
    console.error('retail-os prepare failed', id, failures);
    await db.setPrepError(id, failures.join(' | ').slice(0, 1000)).catch(() => {});
    return json({ status: results.some((r) => r.status === 'fulfilled') ? 'partial' : 'failed' }, 200);
  }
  return json({ status: 'ready' }, 200);
};
