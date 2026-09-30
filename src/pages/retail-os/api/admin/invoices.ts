export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { serviceDb } from '../../../../lib/ledger';
import { brandsDb } from '../../../../lib/brands';
import { getSettings, issueInvoice, saveSettings, suggestBase } from '../../../../lib/invoice-db';
import { missingFields, priceInvoice, type Draft } from '../../../../lib/invoice';

// Admin only (gated by src/middleware.ts). Actions: settings, check, suggest, issue, paid, void.
type Body = { action?: string; settings?: Record<string, unknown>; draft?: Draft & { brandId?: string | null }; brandId?: string; basis?: 'revenue_pct' | 'profit_pct'; start?: string; end?: string; id?: string; reference?: string };

export const POST: APIRoute = async ({ request }) => {
  const b = await readJson<Body>(request);
  if (!b?.action) return json({ error: 'action is required' }, 400);
  const env = getEnv();
  const sb = serviceDb(env) as never;
  try {
    switch (b.action) {
      case 'settings':
        await saveSettings(sb, b.settings ?? {});
        return json({ ok: true, missing: missingFields(await getSettings(sb), { billTo: { company: 'x', address: 'x' }, issueDate: '2026-01-01', lines: [{ basis: 'deposit' }] }) }, 200);
      case 'check': {
        if (!b.draft) return json({ error: 'draft is required' }, 400);
        const s = await getSettings(sb);
        const missing = missingFields(s, b.draft);
        return json({ ok: true, missing, priced: missing.length ? null : priceInvoice(b.draft, s) }, 200);
      }
      case 'suggest': {
        if (!b.brandId || !b.basis || !b.start || !b.end) return json({ error: 'brand, basis and period are required' }, 400);
        const brand = await brandsDb(env).get(b.brandId);
        if (!brand) return json({ error: 'Brand not found' }, 404);
        return json({ ok: true, ...(await suggestBase(sb, brand, b.basis, b.start, b.end)) }, 200);
      }
      case 'issue': {
        if (!b.draft) return json({ error: 'draft is required' }, 400);
        const r = await issueInvoice(sb, b.draft);
        if (!r.ok) return json({ ok: false, missing: r.missing }, 422);
        return json({ ok: true, number: r.invoice.number, url: `/retail-os/invoice/${r.invoice.token}` }, 200);
      }
      case 'paid':
      case 'void': {
        if (!b.id) return json({ error: 'id is required' }, 400);
        const patch = b.action === 'paid' ? { status: 'paid', paid_at: new Date().toISOString(), paid_reference: (b.reference || '').slice(0, 120) || null } : { status: 'void' };
        const { error } = await (sb as any).from('invoices').update(patch).eq('id', b.id);
        if (error) throw new Error(error.message);
        return json({ ok: true }, 200);
      }
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
};
