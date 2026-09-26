export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../../lib/env';
import { json, readJson } from '../../../../../../lib/retail-os-http';
import { leadSb } from '../../../../../../lib/lead-audit-db';
import { canMove, stepFor, EXITS } from '../../../../../../lib/lead-journey';

// Admin: move a lead by hand. Forward only, or out to paused/lost and back in. Logged as a note.
export const POST: APIRoute = async ({ params, request }) => {
  const b = await readJson<{ stage?: string; note?: string }>(request);
  const to = (b?.stage || '').trim();
  if (!to || (!stepFor(to) && !(EXITS as readonly string[]).includes(to))) return json({ error: 'Unknown stage' }, 400);
  const sb = leadSb(getEnv());
  const { data: lead } = await sb.from('leads').select('id, stage').eq('id', params.id ?? '').maybeSingle();
  if (!lead) return json({ error: 'Not found' }, 404);
  if (!canMove(lead.stage as string, to)) return json({ error: `Cannot move from ${lead.stage} to ${to}: the journey only moves forward.` }, 409);
  await sb.from('leads').update({ stage: to }).eq('id', lead.id);
  await sb.from('lead_messages').insert({ lead_id: lead.id, direction: 'internal', channel: 'note', status: 'logged', body: `Stage: ${lead.stage} -> ${to} (by Virat)${b?.note ? `: ${b.note.slice(0, 500)}` : ''}`, created_by: 'admin' });
  return json({ ok: true, stage: to, note: `Moved to ${stepFor(to)?.label ?? to}.` }, 200);
};
