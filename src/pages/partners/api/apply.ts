export const prerender = false;
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../../lib/env';

const clip = (v: unknown, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const row = {
    name: clip(b?.name, 120), phone: clip(b?.phone, 30), email: clip(b?.email, 160) || null,
    city: clip(b?.city, 80) || null, network: clip(b?.network, 1000) || null,
    brands_estimate: clip(b?.brands, 40) || null, nda_accepted: b?.nda === true,
  };
  if (!row.name || row.phone.replace(/\D/g, '').length < 10) return json({ error: 'Name and a valid WhatsApp number are required.' }, 400);
  if (!row.nda_accepted) return json({ error: 'Please accept the NCNDA to continue.' }, 400);
  try {
    const env = getEnv();
    const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await db.from('partner_applications').insert(row);
    if (error) throw error;
    return json({ ok: true });
  } catch (err) {
    console.error('partner apply failed', err);
    return json({ error: 'Could not save. Please WhatsApp me instead.' }, 500);
  }
};
