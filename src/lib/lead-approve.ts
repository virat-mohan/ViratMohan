// One way for any part of the journey to put an email in front of Virat: the draft is parked
// in lead_messages as awaiting_approval, a single-use Approve & send link is signed, and Virat
// is told (WhatsApp if set up, else email). Approving sends it from his Gmail (lead-mail/run.ts)
// and moves the lead to the stage that follows (lead-journey.ts stageAfterSent).
//
// With LEAD_JOURNEY_AUTOSEND=on, standard journey emails skip the tap and go straight out.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env';
import type { LeadApprovalPort, LeadDraftInput } from './lead-approval';
import { signToken } from './lead-mail/token';
import { viratNotifier } from './lead-mail/live';
import { deliver, liveMailDeps } from './mail/send';
import { signatureText } from './mail/links';
import { stageAfterSent } from './lead-journey';

export type JourneyDraft = LeadDraftInput & { leadName: string; toEmail: string | null; context: [string, string] };

const SITE = 'https://viratmohan.com';

/** Park the draft, sign the approve link and tell Virat. Returns the message id and the approve URL. */
export async function submitForApproval(env: Env, sb: SupabaseClient, d: JourneyDraft, now = new Date()): Promise<{ messageId: string; approveUrl: string | null; sent: boolean }> {
  const { data, error } = await sb.from('lead_messages').insert({
    lead_id: d.leadId, direction: 'outbound', channel: 'email', status: 'awaiting_approval',
    subject: d.subject, body: d.body, purpose: d.purpose, send_after: d.sendAfter, created_by: d.createdBy ?? 'lead-journey',
  }).select('id').single();
  if (error) throw new Error(`lead draft: ${error.message}`);
  const messageId = data.id as string;

  if (env.LEAD_JOURNEY_AUTOSEND === 'on' && d.toEmail) {
    await sendNow(env, sb, { id: messageId, lead_id: d.leadId, subject: d.subject, body: d.body, purpose: d.purpose, to: d.toEmail }, now);
    return { messageId, approveUrl: null, sent: true };
  }

  if (!env.LEAD_APPROVAL_SECRET) return { messageId, approveUrl: null, sent: false }; // parked; visible in admin
  const { token, payload } = signToken(messageId, env.LEAD_APPROVAL_SECRET, now.getTime());
  await sb.from('lead_approval_tokens').insert({ nonce: payload.n, message_id: messageId, expires_at: new Date(payload.exp).toISOString() });
  const approveUrl = `${SITE}/api/leads/approve?t=${encodeURIComponent(token)}`;
  try {
    await viratNotifier(env, now)({ kind: 'approval', leadName: d.leadName, subject: d.subject, context: d.context, draft: d.body, approveUrl, gmailUrl: `${SITE}/retail-os/admin/leads` });
  } catch (e) { console.error('lead approval notice failed', e); }
  return { messageId, approveUrl, sent: false };
}

/** Send a parked journey email from Virat's Gmail now, mark it sent and move the stage. */
export async function sendNow(env: Env, sb: SupabaseClient, m: { id: string; lead_id: string; subject: string; body: string; purpose: string | null; to: string }, now = new Date()) {
  const deps = await liveMailDeps(env, now);
  const text = `${m.body}\n\n-- \n${signatureText(env.GMAIL_ADDRESS)}`;
  const via = await deliver({ to: m.to, subject: m.subject, text }, deps);
  await sb.from('lead_messages').update({ status: 'sent', at: now.toISOString(), meta: { via } }).eq('id', m.id);
  const { data: lead } = await sb.from('leads').select('id, stage').eq('id', m.lead_id).maybeSingle();
  if (lead) {
    const next = stageAfterSent(m.purpose, lead.stage as string);
    const patch: Record<string, unknown> = {};
    if (next !== lead.stage) patch.stage = next;
    if (m.purpose === 'nda_request') patch.nda_sent_at = now.toISOString();
    if (m.purpose === 'nda_reminder') patch.nda_reminded_at = now.toISOString();
    if (Object.keys(patch).length) await sb.from('leads').update(patch).eq('id', m.lead_id);
  }
  return via;
}

/** A port for cron paths that handle many leads: looks each lead up before notifying. */
export function journeyApproval(env: Env, sb: SupabaseClient): LeadApprovalPort {
  return {
    async submit(d) {
      const { data: lead } = await sb.from('leads').select('id, brand_name, contact_name, contact_email').eq('id', d.leadId).maybeSingle();
      if (!lead) throw new Error('lead not found');
      return notifyingApproval(env, sb, lead as { id: string; brand_name: string; contact_name: string | null; contact_email: string | null }).submit(d);
    },
  };
}

/** An approval port for the audit/plan code paths, so their drafts reach Virat too. */
export function notifyingApproval(env: Env, sb: SupabaseClient, lead: { id: string; brand_name: string; contact_name: string | null; contact_email: string | null }): LeadApprovalPort {
  return {
    async submit(d) {
      const what: Record<string, string> = {
        access_request: 'NDA signed. Draft asks for read-only access to their data.',
        access_reminder: 'Access has stalled 48h. Draft nudges them.',
        plan_cover: 'Plan is ready. Draft sends it with the 90-day goal.',
      };
      const r = await submitForApproval(env, sb, { ...d, leadName: lead.brand_name, toEmail: lead.contact_email, context: [`${lead.contact_name || 'Founder'} (${lead.brand_name})`, what[d.purpose] ?? d.purpose] });
      return { messageId: r.messageId };
    },
  };
}
