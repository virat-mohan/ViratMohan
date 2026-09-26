export const prerender = false;
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../../lib/env';

const clip = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const PRODUCTS = ['retail-os', 'devshop', 'partner'];
const CATEGORIES = ['question', 'change', 'bug'];

export const POST: APIRoute = async ({ request }) => {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const product = clip(b?.product, 40);
  const category = clip(b?.category, 20);
  const row = {
    product: PRODUCTS.includes(product) ? product : null,
    category: CATEGORIES.includes(category) ? category : 'question',
    message: clip(b?.message, 4000),
    contact: clip(b?.contact, 160) || null,
  };
  if (!row.message) return json({ error: 'Please tell me what you need.' }, 400);
  try {
    const env = getEnv();
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await db.from('change_requests').insert(row);
    if (error) throw error;
    return json({ ok: true });
  } catch (err) {
    console.error('change request failed', err);
    return json({ error: 'Could not save. Please WhatsApp me instead.' }, 500);
  }
};
