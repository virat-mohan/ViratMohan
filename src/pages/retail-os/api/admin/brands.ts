export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { brandsDb, brandKeyOf, type Brand, type Contact } from '../../../../lib/brands';

// Admin (gated by src/middleware.ts): create, edit or delete a brand record.
type Body = { action?: 'save' | 'delete'; id?: string } & Partial<Brand>;
const STATUSES = ['lead', 'building', 'live', 'paused', 'ended'];
const MODELS = ['profit_share', 'retainer', 'co_owned', 'revenue_share', 'none'];

export const POST: APIRoute = async ({ request }) => {
  const b = await readJson<Body>(request);
  if (!b) return json({ error: 'Bad request' }, 400);
  const db = brandsDb(getEnv());
  try {
    if (b.action === 'delete') {
      if (!b.id) return json({ error: 'id is required' }, 400);
      await db.remove(b.id);
      return json({ ok: true }, 200);
    }
    const name = (b.name || '').trim().slice(0, 120);
    if (!name) return json({ error: 'Name is required' }, 400);
    const key = (b.key || brandKeyOf(name)).trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);
    const num = (v: unknown) => (v === '' || v == null ? null : Number(v));
    const str = (v: unknown, n = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
    const contacts: Contact[] = (Array.isArray(b.contacts) ? b.contacts : []).map((c) => ({ name: String(c?.name ?? '').trim().slice(0, 120), role: String(c?.role ?? '').trim().slice(0, 60), email: String(c?.email ?? '').trim().toLowerCase().slice(0, 200), phone: String(c?.phone ?? '').trim().slice(0, 40) })).filter((c) => c.name || c.email || c.phone);
    const saved = await db.upsert({
      ...(b.id ? { id: b.id } : {}), key, name,
      status: STATUSES.includes(String(b.status)) ? (b.status as Brand['status']) : 'lead',
      model: MODELS.includes(String(b.model)) ? (b.model as Brand['model']) : null,
      devshop_pct: num(b.devshop_pct), retainer_inr: num(b.retainer_inr), terms_note: str(b.terms_note, 400),
      website: str(b.website), instagram: str(b.instagram)?.replace(/^@/, '') ?? null, category: str(b.category, 80),
      contacts, live_since: str(b.live_since, 10), retail_os_since: str(b.retail_os_since, 10), notes: str(b.notes, 2000),
      lead_id: str(b.lead_id, 40), application_id: str(b.application_id, 40),
    });
    return json({ ok: true, brand: saved }, 200);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
};
