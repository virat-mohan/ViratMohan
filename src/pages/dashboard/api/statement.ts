export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { serviceDb } from '../../../lib/ledger';
import { json } from '../../../lib/retail-os-http';

// The Money tab's real statement. The link token (settlements.view_token) comes
// from the statement email; it identifies the brand, and the newest settlement
// for that brand is returned. No token or no settlements → 404, and the page
// keeps its labelled sample data.
export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'Not found' }, 404);
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Not found' }, 404);
  const sb = serviceDb(env);
  const { data: s } = await sb.from('settlements').select('brand_key').eq('view_token', token).maybeSingle();
  if (!s) return json({ error: 'Not found' }, 404);
  const { data: latest } = await sb.from('settlements')
    .select('week_start, week_end, status, lines, payout_paise, paid_at, terms_snapshot, hold_reasons')
    .eq('brand_key', s.brand_key).order('week_start', { ascending: false }).limit(1).maybeSingle();
  if (!latest) return json({ error: 'Not found' }, 404);
  return new Response(JSON.stringify(latest), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
};
