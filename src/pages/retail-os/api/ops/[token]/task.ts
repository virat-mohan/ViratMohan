export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { getOpsDb, OPS_STATUSES, STATUS_LABEL, type OpsStatus } from '../../../../../lib/retail-os-ops';
import { json, readJson } from '../../../../../lib/retail-os-http';

// A team member updates one of their own tasks. The token in the URL is the
// bearer, like a brand's tracker; a task can only be changed by its owner.
export const POST: APIRoute = async ({ params, request }) => {
  const token = params.token;
  const body = await readJson<{ taskId?: string; status?: string; note?: string }>(request);
  if (!token || !body?.taskId) return json({ error: 'Missing task' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const db = getOpsDb(env);
  const member = await db.memberByToken(token);
  if (!member) return json({ error: 'Not found' }, 404);

  const patch: { status?: OpsStatus; note?: string | null } = {};
  if (body.status !== undefined) {
    if (!OPS_STATUSES.includes(body.status as OpsStatus)) return json({ error: 'Bad status' }, 400);
    patch.status = body.status as OpsStatus;
  }
  if (body.note !== undefined) patch.note = String(body.note).trim().slice(0, 2000) || null;

  const task = await db.updateTask(member.id, body.taskId, patch);
  if (!task) return json({ error: 'Task not found' }, 404);
  if (patch.status) await db.addLog(member.id, 'status', `${task.brand_name}: ${task.task} → ${STATUS_LABEL[patch.status]}`, task.id);
  else if (patch.note) await db.addLog(member.id, 'note', `${task.brand_name}: ${task.task}: ${patch.note}`, task.id);
  return json({ ok: true, task }, 200);
};
