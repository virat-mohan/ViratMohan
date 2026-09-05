export const prerender = false;
// Admin-only — protected by src/middleware.ts (same prefix rule as frameworks.ts).

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';
import type { ResourceCategory } from '../../../lib/amc';

type Body =
  | {
      action: 'add';
      resource_category: ResourceCategory;
      domain: string;
      role_label: string;
      rate_per_hour_inr: number;
      source: string;
      verified: boolean;
      note?: string;
    }
  | { action: 'setActive'; id: string; active: boolean };

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !body.action) return json({ error: 'action is required' }, 400);

  const db = getDb(env);
  try {
    if (body.action === 'add') {
      if (!body.domain?.trim() || !body.role_label?.trim() || !body.source?.trim() || !body.rate_per_hour_inr) {
        return json({ error: 'domain, role_label, source, and rate_per_hour_inr are required' }, 400);
      }
      await db.addAmcRate({
        resource_category: body.resource_category,
        domain: body.domain.trim(),
        role_label: body.role_label.trim(),
        rate_per_hour_inr: body.rate_per_hour_inr,
        source: body.source.trim(),
        verified: !!body.verified,
        note: body.note?.trim() || null,
      });
    } else if (body.action === 'setActive') {
      await db.setAmcRateActive(body.id, body.active);
    } else {
      return json({ error: 'unknown action' }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
