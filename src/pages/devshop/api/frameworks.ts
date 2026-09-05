export const prerender = false;
// Admin-only. Same protection gap as /devshop/admin/* — gate this path too.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';

type Body =
  | { action: 'add'; name: string; source: string; business_function: string; when_to_use: string; link?: string }
  | { action: 'setActive'; id: string; active: boolean };

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !body.action) return json({ error: 'action is required' }, 400);

  const db = getDb(env);
  try {
    if (body.action === 'add') {
      if (!body.name?.trim() || !body.source?.trim() || !body.when_to_use?.trim()) {
        return json({ error: 'name, source, and when_to_use are required' }, 400);
      }
      await db.addFramework({
        name: body.name.trim(),
        source: body.source.trim(),
        business_function: body.business_function,
        when_to_use: body.when_to_use.trim(),
        link: body.link?.trim() || null,
      });
    } else if (body.action === 'setActive') {
      await db.setFrameworkActive(body.id, body.active);
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
