// Build progress notes: while a store is being built (days 3 to 7), the founder hears from
// Virat every 2 days with what is done, what is next, and anything that needs them. Drafted
// from the ops tracker, approved by Virat like every other journey email. Prince stays
// behind the scenes: the note comes from Virat.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env';
import { sendAfter } from './brain/communicate';
import { submitForApproval } from './lead-approve';
import { goLiveTarget } from './lead-journey';

export const UPDATE_EVERY_DAYS = 2;

export type TaskLite = { task: string; status: string; owner: 'team' | 'founder' | 'brand' };
export type BuildDraft = { purpose: 'build_update'; subject: string; body: string; sendAfter: string };

const hi = (name?: string | null) => (name?.trim() ? `Hi ${name.trim().split(/\s+/)[0]},` : 'Hi,');
const list = (t: TaskLite[]) => t.slice(0, 5).map((x) => `- ${x.task}`).join('\n');

/** Pure: the note, from the tracker's state. Null when there is nothing to say yet. */
export function buildUpdateDraft(lead: { brand_name: string; contact_name?: string | null; clock_started_at?: string | null }, tasks: TaskLite[], now: Date): BuildDraft | null {
  const live = tasks.filter((t) => t.status !== 'na');
  if (!live.length) return null;
  const done = live.filter((t) => t.status === 'done');
  const next = live.filter((t) => t.status === 'todo' || t.status === 'doing');
  const yours = next.filter((t) => t.owner === 'brand' || t.owner === 'founder');
  const target = goLiveTarget(lead);
  const when = target ? target.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }) : null;
  const pct = Math.round((done.length / live.length) * 100);
  const body = [
    hi(lead.contact_name),
    `A short note on the ${lead.brand_name} build: ${pct}% done${when ? `, on track for ${when}` : ''}.`,
    done.length ? `Done so far:\n${list(done)}` : null,
    next.length ? `Next:\n${list(next.filter((t) => !yours.includes(t)))}`.replace(/Next:\n$/, '') : null,
    yours.length ? `One thing I need from you, so the date holds:\n${list(yours)}` : 'Nothing needed from you right now.',
    'Reply here with anything at all.',
    'Virat',
  ].filter((s): s is string => !!s && s.trim() !== '').join('\n\n');
  return { purpose: 'build_update', subject: `${lead.brand_name}: ${pct}% built`, body, sendAfter: sendAfter(now).toISOString() };
}

type LeadRow = { id: string; brand_name: string; contact_name: string | null; contact_email: string | null; clock_started_at: string | null };

/** Daily: every lead in 'building' whose last build note is 2+ days old gets a fresh draft for approval. */
export async function draftBuildUpdates(env: Env, sb: SupabaseClient, now = new Date()): Promise<string[]> {
  const { data: leads } = await sb.from('leads').select('id, brand_name, contact_name, contact_email, clock_started_at').eq('stage', 'building').not('contact_email', 'is', null);
  const out: string[] = [];
  const cutoff = new Date(now.getTime() - UPDATE_EVERY_DAYS * 86_400_000).toISOString();
  for (const lead of (leads ?? []) as LeadRow[]) {
    try {
      const { data: last } = await sb.from('lead_messages').select('id').eq('lead_id', lead.id).eq('purpose', 'build_update').in('status', ['sent', 'awaiting_approval']).gte('at', cutoff).limit(1);
      if (last?.length) continue;
      const { data: tasks } = await sb.from('retail_os_ops_tasks').select('task, status, owner').ilike('brand_name', lead.brand_name);
      const d = buildUpdateDraft(lead, (tasks ?? []) as TaskLite[], now);
      if (!d) continue;
      await submitForApproval(env, sb, { ...d, leadId: lead.id, leadName: lead.brand_name, toEmail: lead.contact_email, context: [`${lead.contact_name || 'Founder'} (${lead.brand_name}), building`, 'Draft is the 2-day build note: done, next, and anything needed from them.'] }, now);
      out.push(lead.id);
    } catch (e) {
      console.error('build update draft failed', lead.id, e);
    }
  }
  return out;
}
