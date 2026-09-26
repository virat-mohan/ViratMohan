export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { getOpsDb } from '../../../../../lib/retail-os-ops';
import { json, readJson } from '../../../../../lib/retail-os-http';
import { sendEmail } from '../../../../../lib/email';
import { getOrigin } from '../../../../../lib/http';
import { mailConfigured } from '../../../../../lib/mail/send';
import { serverBrain } from '../../../../../lib/brain';
import { handleTeamQuestion } from '../../../../../lib/team-support';

// Daily update or a question from a team member. Questions get an emailed
// answer from the Brain, or go to the founder as a nudge (lib/team-support.ts).
export const POST: APIRoute = async ({ params, request }) => {
  const token = params.token;
  const body = await readJson<{ kind?: string; body?: string }>(request);
  const text = (body?.body || '').trim().slice(0, 4000);
  const kind = body?.kind === 'query' ? 'query' : 'daily';
  if (!token || !text) return json({ error: 'Write something first.' }, 400);

  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Backend not configured' }, 503);
  const db = getOpsDb(env);
  const member = await db.memberByToken(token);
  if (!member) return json({ error: 'Not found' }, 404);

  await db.addLog(member.id, kind, text);

  if (kind === 'query' && mailConfigured(env)) {
    const origin = getOrigin(request);
    const brain = serverBrain(env);
    try {
      const r = await handleTeamQuestion(member, text, {
        answer: (q) => brain.answer(q, { audience: { audience: 'staff', authenticated: true } }),
        send: (m) => sendEmail(m, env),
        log: (k, b) => db.addLog(member.id, k, b),
        viratEmail: env.ADMIN_NOTIFY_EMAIL || 'viratmohan@gmail.com',
        trackerUrl: `${origin}/retail-os/ops/${member.token}`,
        consoleUrl: `${origin}/retail-os/admin/console`,
      });
      return json({ ok: true, ...r }, 200);
    } catch (err) {
      console.error('ops query support failed', err);
    }
  }
  return json({ ok: true }, 200);
};
