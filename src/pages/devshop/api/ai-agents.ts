export const prerender = false;
// Admin-only. Same protection gap as /devshop/admin/* — gate this path too.

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { getEnv } from '../../../lib/env';

type Body =
  | {
      action: 'add';
      name: string;
      capability_category: string;
      description: string;
      typical_trigger: string;
      typical_output: string;
    }
  | { action: 'setActive'; id: string; active: boolean };

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !body.action) return json({ error: 'action is required' }, 400);

  const db = getDb(env);
  try {
    if (body.action === 'add') {
      if (!body.name?.trim() || !body.description?.trim()) {
        return json({ error: 'name and description are required' }, 400);
      }
      await db.addAiAgent({
        name: body.name.trim(),
        capability_category: body.capability_category.trim(),
        description: body.description.trim(),
        typical_trigger: body.typical_trigger.trim(),
        typical_output: body.typical_output.trim(),
      });
    } else if (body.action === 'setActive') {
      await db.setAiAgentActive(body.id, body.active);
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
