export const prerender = false;
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../../lib/env';

// Public: live Retail OS counters for the DevShop featured card. Counts only, no personal data.
export const GET: APIRoute = async () => {
  try {
    const env = getEnv();
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [all, recent, plans] = await Promise.all([
      db.from('retail_os_applications').select('id', { count: 'exact', head: true }),
      db.from('retail_os_applications').select('id', { count: 'exact', head: true }).gte('created_at', since),
      db.from('retail_os_business_plans').select('id', { count: 'exact', head: true }),
    ]);
    return new Response(JSON.stringify({ applications: all.count ?? 0, applications30d: recent.count ?? 0, plans: plans.count ?? 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('retail-os stats failed', err);
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  }
};
