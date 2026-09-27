export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { serviceDb } from '../../../../lib/ledger';
import { json, readJson } from '../../../../lib/retail-os-http';

// Gated by src/middleware.ts. Virat publishes or dismisses a case study from the founder
// console. Publishing is the one public act here, so it stays a human click.
export const POST: APIRoute = async ({ request }) => {
  const b = await readJson<{ id?: string; action?: 'publish' | 'dismiss' }>(request);
  const id = (b?.id || '').trim();
  if (!id || (b?.action !== 'publish' && b?.action !== 'dismiss')) return json({ error: 'id and action (publish|dismiss) are required' }, 400);
  const sb = serviceDb(getEnv());
  const patch = b.action === 'publish' ? { status: 'published', published_at: new Date().toISOString() } : { status: 'dismissed' };
  const { error } = await sb.from('case_studies').update(patch).eq('id', id).eq('status', 'draft');
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, status: patch.status }, 200);
};
