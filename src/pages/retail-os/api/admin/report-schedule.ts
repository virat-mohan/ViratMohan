export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getLiveBrands } from '../../../../lib/retail-os-portfolio';
import { json, readJson } from '../../../../lib/retail-os-http';

// Gated by src/middleware.ts. Adds a report schedule or switches one on/off.
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ action?: string; id?: string; active?: boolean; brandKey?: string; frequency?: string; channel?: string; recipient?: string }>(request);
  const db = getRetailOsDb(getEnv());

  if (body?.action === 'toggle') {
    if (!body.id) return json({ error: 'id is required' }, 400);
    await db.setReportScheduleActive(body.id, !!body.active);
    return json({ ok: true }, 200);
  }

  if (body?.action === 'add') {
    if (!getLiveBrands().some((b) => b.key === body.brandKey)) return json({ error: 'Unknown brand' }, 400);
    if (!['daily', 'weekly', 'monthly'].includes(body.frequency ?? '')) return json({ error: 'Pick daily, weekly or monthly' }, 400);
    const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const recipient = (body.recipient || '').trim().slice(0, 200);
    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return json({ error: 'Enter a valid email address' }, 400);
    if (channel === 'whatsapp' && !/^\+?\d{10,15}$/.test(recipient.replace(/[\s-]/g, ''))) return json({ error: 'Enter a WhatsApp number with country code' }, 400);
    await db.addReportSchedule({ brand_key: body.brandKey!, frequency: body.frequency!, channel, recipient });
    return json({ ok: true }, 200);
  }

  return json({ error: 'Unknown action' }, 400);
};
