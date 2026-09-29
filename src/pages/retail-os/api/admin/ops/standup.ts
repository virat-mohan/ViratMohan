export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { json, readJson } from '../../../../../lib/retail-os-http';
import { serviceDb } from '../../../../../lib/ledger';
import { getLiveBrands, checkBrandConnection } from '../../../../../lib/retail-os-portfolio';
import { computeStandup, verifyBrandEnvironment, verificationAuditBody, type StandupTask } from '../../../../../lib/retail-os-standup';

// Admin only (gated by src/middleware.ts — /retail-os/api/admin). Read-only view of a brand's
// stand-up status, and a POST that runs the deterministic environment check and records it to the
// existing ops audit log. Never marks a task complete; never flips a brand live.

async function loadStandup(env: ReturnType<typeof getEnv>, brandKey: string, envVerified: boolean | null) {
  const sb = serviceDb(env);
  const { data: tasks } = await sb.from('retail_os_ops_tasks')
    .select('stage, status, owner, task, note, priority, sort').eq('brand_key', brandKey);
  const { data: brand } = await sb.from('brands').select('status').eq('key', brandKey).maybeSingle();
  const brandLive = brand?.status === 'live';
  return computeStandup((tasks ?? []) as StandupTask[], brandLive, envVerified);
}

export const GET: APIRoute = async ({ url }) => {
  const brandKey = (url.searchParams.get('brand') || '').trim();
  if (!brandKey) return json({ error: 'brand is required' }, 400);
  if (!getEnv().SUPABASE_URL) return json({ error: 'Backend not configured' }, 503);
  try {
    return json({ brand: brandKey, standup: await loadStandup(getEnv(), brandKey, null) }, 200);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
};

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const b = await readJson<{ brand?: string }>(request);
  const brandKey = (b?.brand || '').trim();
  if (!brandKey) return json({ error: 'brand is required' }, 400);
  if (!env.SUPABASE_URL) return json({ error: 'Backend not configured' }, 503);
  const sb = serviceDb(env);
  try {
    // Deterministic environment check against the brand's own Supabase project.
    const result = await verifyBrandEnvironment(brandKey, { listBrands: getLiveBrands, check: checkBrandConnection });
    const passed = result.found && result.check.ok;
    // Audit to the existing ops log, attached to the operations member who owns this brand's tasks.
    // The body carries only the project ref and result — never a service key.
    const { data: member } = await sb.from('retail_os_team_members')
      .select('id').eq('active', true).ilike('role', '%operations%').order('started_on').limit(1).maybeSingle();
    if (member) {
      await sb.from('retail_os_ops_log').insert({ member_id: member.id, kind: 'status', body: verificationAuditBody(result, brandKey) });
    }
    const standup = await loadStandup(env, brandKey, passed ? true : result.found ? false : null);
    return json({ brand: brandKey, verified: passed, configured: result.found, standup, audited: !!member }, 200);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
};
