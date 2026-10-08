export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { json, readJson } from '../../../../lib/retail-os-http';
import { serviceDb } from '../../../../lib/ledger';
import { createSupabaseWorkStore } from '../../../../lib/work/db-store';
import { checkAdminAuth } from '../../../../lib/admin-auth';
import { handleWorkerAction, type WorkerActionRequest } from '../../../../lib/ceo/people-action';

const ACTIONS = ['accept', 'start', 'update_progress', 'record_blocker', 'clear_blocker', 'submit_completion'] as const;

interface Body { worker_id?: unknown; work_id?: unknown; action?: unknown; note?: unknown; blocker_reason?: unknown }

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const auth = checkAdminAuth(request.headers.get('authorization'), env.ADMIN_PASSWORD);
  if (!auth.ok) return json({ error: auth.status === 503 ? 'Admin access is not configured' : 'Authentication required' }, auth.status);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Work Registry not configured' }, 503);

  const body = await readJson<Body>(request);
  if (!body || typeof body.worker_id !== 'string' || !body.worker_id.trim()) return json({ error: 'worker_id is required' }, 400);
  if (typeof body.work_id !== 'string' || !body.work_id.trim()) return json({ error: 'work_id is required' }, 400);
  if (typeof body.action !== 'string' || !ACTIONS.includes(body.action as any)) return json({ error: `action must be one of ${ACTIONS.join(', ')}` }, 400);

  const store = createSupabaseWorkStore(serviceDb(env));
  const req: WorkerActionRequest = {
    worker_id: body.worker_id.trim(),
    work_id: body.work_id.trim(),
    action: body.action as WorkerActionRequest['action'],
    note: typeof body.note === 'string' ? body.note : undefined,
    blocker_reason: typeof body.blocker_reason === 'string' ? body.blocker_reason : undefined,
  };

  const r = await handleWorkerAction(store, req);
  if (!r.ok) return json({ error: r.error.message, code: r.error.code }, 400);

  const item = r.value;
  return json({
    work: { id: item.id, ref: item.ref, title: item.title, state: item.state, priority: item.priority, owner: item.owner?.id ?? null },
    action: req.action,
    eventCount: item.events.length,
  });
};
