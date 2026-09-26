// Keeps the lead record in step with the Retail OS application it becomes. Called when a
// founder applies, signs terms, and pays the deposit, so the journey on /retail-os/admin/leads
// shows the truth without anyone updating it by hand. Never moves a lead backwards.
import type { SupabaseClient } from '@supabase/supabase-js';
import { forward } from './lead-journey';

export type AppRef = { id: string; brand_name: string; founder_name?: string | null; founder_email: string; founder_phone?: string | null; handle?: string | null; shopify_url?: string | null; category?: string | null };

export async function syncLeadFromApplication(sb: SupabaseClient, app: AppRef, stage: 'applied' | 'signed' | 'deposit_paid' | 'building' | 'live'): Promise<string | null> {
  try {
    const email = app.founder_email.trim().toLowerCase();
    let { data: lead } = await sb.from('leads').select('id, stage').eq('application_id', app.id).maybeSingle();
    if (!lead && email) ({ data: lead } = await sb.from('leads').select('id, stage').ilike('contact_email', email).maybeSingle());
    if (!lead) {
      const { data: created, error } = await sb.from('leads').insert({
        brand_name: app.brand_name, contact_name: app.founder_name ?? null, contact_email: email || null, contact_phone: app.founder_phone ?? null,
        website: app.shopify_url ?? null, instagram: app.handle ?? null, category: app.category ?? null, source: 'site_apply', stage,
        application_id: app.id, next_step: null,
      }).select('id, stage').single();
      if (error) throw error;
      await sb.from('lead_messages').insert({ lead_id: created.id, direction: 'internal', channel: 'note', status: 'logged', body: `Applied on the site (${app.brand_name}).`, created_by: 'lead-sync' });
      return created.id as string;
    }
    const next = forward(lead.stage as string, stage);
    const patch: Record<string, unknown> = { application_id: app.id };
    if (next !== lead.stage) patch.stage = next;
    await sb.from('leads').update(patch).eq('id', lead.id);
    if (next !== lead.stage) await sb.from('lead_messages').insert({ lead_id: lead.id, direction: 'internal', channel: 'note', status: 'logged', body: `Stage: ${lead.stage} -> ${next} (${stage === 'applied' ? 'applied on the site' : stage === 'signed' ? 'signed the terms' : stage === 'deposit_paid' ? 'deposit confirmed' : stage})`, created_by: 'lead-sync' });
    return lead.id as string;
  } catch (e) {
    console.error('lead sync failed', e);
    return null;
  }
}
