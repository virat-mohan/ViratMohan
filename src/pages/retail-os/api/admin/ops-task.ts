export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { cleanTaskInput, getOpsDb } from '../../../../lib/retail-os-ops';
import { json, readJson } from '../../../../lib/retail-os-http';

// Founder console: add, change or remove any team task. Behind the admin
// password (src/lib/admin-auth.ts covers /retail-os/api/admin).
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return json({ error: 'Bad request' }, 400);
  const db = getOpsDb(env);
  const action = String(body.action || '');

  if (action === 'delete') {
    if (!body.taskId) return json({ error: 'Missing task' }, 400);
    await db.deleteTask(String(body.taskId));
    return json({ ok: true }, 200);
  }

  const keys = (await db.listObjectives()).map((o) => o.key);
  const clean = cleanTaskInput((body.fields ?? {}) as Record<string, unknown>, keys);
  if ('error' in clean) return json({ error: clean.error }, 400);

  if (action === 'create') {
    if (!body.memberId || !clean.patch.task) return json({ error: 'Write the task first' }, 400);
    return json({ ok: true, task: await db.createTask(String(body.memberId), clean.patch) }, 200);
  }
  if (action === 'update') {
    if (!body.taskId) return json({ error: 'Missing task' }, 400);
    const task = await db.editTask(String(body.taskId), clean.patch);
    return task ? json({ ok: true, task }, 200) : json({ error: 'Task not found' }, 404);
  }
  return json({ error: 'Unknown action' }, 400);
};
