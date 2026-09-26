// How lead drafts reach Virat for approval. Nothing is sent from here.
//
// Contract with the lead email approval flow (/api/leads/approve and the Gmail sender, built separately):
//   1. A draft is a lead_messages row: direction 'outbound', channel 'email', status 'awaiting_approval',
//      with subject, body, purpose and send_after (already inside 9am-8pm IST, Mon-Sat).
//   2. The approval flow sends it as Virat on approval, sets status 'sent' and external_ref, and calls
//      onLeadMessageSent() so the lead's stage moves (plan_cover -> plan_sent).
// If that flow is not deployed yet, drafts simply wait in lead_messages; nothing goes out.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Draft } from './lead-access';

export type LeadDraftInput = Draft & { leadId: string; createdBy?: string };
export type SubmittedDraft = { messageId: string };

export interface LeadApprovalPort {
  submit(draft: LeadDraftInput): Promise<SubmittedDraft>;
}

/** Default port: park the draft in lead_messages as awaiting_approval. */
export function dbApproval(sb: SupabaseClient): LeadApprovalPort {
  return {
    async submit(d) {
      const { data, error } = await sb.from('lead_messages').insert({
        lead_id: d.leadId, direction: 'outbound', channel: 'email', status: 'awaiting_approval',
        subject: d.subject, body: d.body, purpose: d.purpose, send_after: d.sendAfter, created_by: d.createdBy ?? 'lead-audit',
      }).select('id').single();
      if (error) throw new Error(`lead draft: ${error.message}`);
      return { messageId: data.id as string };
    },
  };
}

/** Called by the sender after an approved message goes out. */
export async function onLeadMessageSent(sb: SupabaseClient, msg: { lead_id: string; purpose?: string | null }) {
  if (msg.purpose === 'plan_cover') {
    await sb.from('leads').update({ stage: 'plan_sent', updated_at: new Date().toISOString() }).eq('id', msg.lead_id).eq('stage', 'plan_ready');
    await sb.from('lead_plans').update({ status: 'sent' }).eq('lead_id', msg.lead_id).eq('status', 'draft');
  }
}
