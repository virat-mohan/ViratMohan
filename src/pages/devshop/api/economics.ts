export const prerender = false;

// Stage 5D — Custom Build economics capture + read. Admin only (add /devshop/api/economics to
// PROTECTED_PREFIXES). Manual, authenticated, auditable entry of worklog hours, direct costs and
// revenue actuals; GET returns the deterministic computed economics. No pricing, no rates, no
// public exposure. Never treats a deposit as revenue.
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { getDb } from '../../../lib/db';
import { serviceDb } from '../../../lib/ledger';
import { json } from '../../../lib/retail-os-http';
import { economicsStore, validateWorklog, validateCost, type WorklogInput, type CostInput, type RevenueInput } from '../../../lib/devshop-economics-db';
import type { RevenueBasis } from '../../../lib/devshop-economics';

async function requireBuild(env: ReturnType<typeof getEnv>, id: string) {
  const row = await getDb(env).getById(id);
  return row ? row : null;
}

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv();
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);
  if (!env.SUPABASE_URL) return json({ error: 'Backend not configured' }, 503);
  if (!(await requireBuild(env, id))) return json({ error: 'not found' }, 404);
  const basis = (url.searchParams.get('basis') as RevenueBasis) || 'collected';
  try {
    return json({ id, economics: await economicsStore(serviceDb(env)).compute(id, basis) }, 200);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
};

type Body =
  | { id: string; action: 'worklog'; entry: WorklogInput }
  | { id: string; action: 'cost'; entry: CostInput }
  | { id: string; action: 'revenue'; entry: RevenueInput };

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !body.id || !body.action) return json({ error: 'id and action are required' }, 400);
  if (!env.SUPABASE_URL) return json({ error: 'Backend not configured' }, 503);
  if (!(await requireBuild(env, body.id))) return json({ error: 'not found' }, 404);

  const store = economicsStore(serviceDb(env)); // operator defaults to 'admin' (single shared credential)
  try {
    switch (body.action) {
      case 'worklog': {
        const err = validateWorklog(body.entry);
        if (err) return json({ error: err }, 400);
        await store.addWorklog(body.id, body.entry);
        break;
      }
      case 'cost': {
        const err = validateCost(body.entry);
        if (err) return json({ error: err }, 400);
        await store.addCost(body.id, body.entry);
        break;
      }
      case 'revenue':
        if (body.entry.contractedPaise == null && body.entry.invoicedPaise == null && body.entry.collectedPaise == null)
          return json({ error: 'at least one of contracted/invoiced/collected is required' }, 400);
        await store.setRevenue(body.id, body.entry);
        break;
      default:
        return json({ error: 'unknown action' }, 400);
    }
    return json({ ok: true, economics: await store.compute(body.id) }, 200);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
};
