// Server side of the NDA step: the signed link, drafting the request and reminder, recording
// the signature, and what happens next (the access request, automatically).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env';
import { signLeadToken } from './lead-token';
import { ndaHash, ndaRequestDraft, ndaReminderDraft, ndaText, NDA_VERSION } from './lead-nda';
import { submitForApproval, notifyingApproval } from './lead-approve';
import { requestAccess, type Lead as AuditLead } from './lead-audit-db';
import { sendEmail } from './email';
import { renderRetailOsEmail } from './retail-os-email';
import { mailConfigured } from './mail/send';
import { LIVE_IN_DAYS } from './lead-journey';

export const SITE = 'https://viratmohan.com';
export const ndaLink = (env: Env, id: string) => `${SITE}/retail-os/nda/${signLeadToken(id, 'nda', env.LEAD_TOKEN_SECRET)}`;

export type LeadLite = { id: string; brand_name: string; contact_name: string | null; contact_email: string | null; contact_phone?: string | null; stage: string };
export type NdaRow = { id: string; lead_id: string; version: string; entity_name: string; entity_address: string; signatory_name: string; signatory_title: string | null; signatory_email: string | null; text_hash: string; signed_at: string; ip: string | null };

export async function getNda(sb: SupabaseClient, leadId: string): Promise<NdaRow | null> {
  const { data, error } = await sb.from('lead_nda').select('*').eq('lead_id', leadId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as NdaRow | null;
}

/** Draft the NDA email (one-tap approval, or straight out with LEAD_JOURNEY_AUTOSEND=on). */
export async function sendNdaRequest(env: Env, sb: SupabaseClient, lead: LeadLite, now = new Date()) {
  if (!lead.contact_email) throw new Error('This lead has no email address.');
  if (!env.LEAD_TOKEN_SECRET) throw new Error('LEAD_TOKEN_SECRET is not set');
  const link = ndaLink(env, lead.id);
  const d = ndaRequestDraft(lead, link, now);
  const r = await submitForApproval(env, sb, { ...d, leadId: lead.id, leadName: lead.brand_name, toEmail: lead.contact_email, context: [`${lead.contact_name || 'Founder'} (${lead.brand_name}), new lead`, 'Draft sends the mutual NCNDA to sign online. Stage moves to NDA sent when it goes.'] }, now);
  return { ...r, link };
}

export async function sendNdaReminder(env: Env, sb: SupabaseClient, lead: LeadLite, now = new Date()) {
  if (!lead.contact_email) throw new Error('This lead has no email address.');
  const link = ndaLink(env, lead.id);
  const d = ndaReminderDraft(lead, link, now);
  return submitForApproval(env, sb, { ...d, leadId: lead.id, leadName: lead.brand_name, toEmail: lead.contact_email, context: [`${lead.contact_name || 'Founder'} (${lead.brand_name}), NDA sent ${daysAgo(lead, now)}`, 'Draft nudges them to sign, gently.'] }, now);
}
const daysAgo = (l: { nda_sent_at?: string | null }, now: Date) => { const t = Date.parse(l.nda_sent_at ?? ''); return t ? `${Math.floor((now.getTime() - t) / 86_400_000)} days ago` : 'earlier'; };

/** Daily: leads at nda_sent for 3+ days with no reminder in the last 3 days get one gentle nudge drafted. */
export async function remindUnsignedNda(env: Env, sb: SupabaseClient, now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const { data } = await sb.from('leads').select('id, brand_name, contact_name, contact_email, contact_phone, stage, nda_sent_at, nda_reminded_at').eq('stage', 'nda_sent').not('contact_email', 'is', null).lte('nda_sent_at', cutoff);
  const out: string[] = [];
  for (const lead of (data ?? []) as (LeadLite & { nda_sent_at: string | null; nda_reminded_at: string | null })[]) {
    if (lead.nda_reminded_at && lead.nda_reminded_at > cutoff) continue;
    if (await getNda(sb, lead.id)) continue;
    try { await sendNdaReminder(env, sb, lead, now); await sb.from('leads').update({ nda_reminded_at: now.toISOString() }).eq('id', lead.id); out.push(lead.id); }
    catch (e) { console.error('nda reminder failed', lead.id, e); }
  }
  return out;
}

export type SignInput = { entity_name: string; entity_address: string; signatory_name: string; signatory_title?: string | null; signatory_email?: string | null; ip?: string | null; user_agent?: string | null };

/** Record the signature, move the lead on, email both parties, and start the access request. */
export async function recordNdaSignature(env: Env, sb: SupabaseClient, lead: LeadLite, input: SignInput, now = new Date()): Promise<{ ok: true; nda: NdaRow } | { ok: false; error: string }> {
  const existing = await getNda(sb, lead.id);
  if (existing) return { ok: false, error: 'This agreement is already signed.' };
  const effectiveDate = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const text = ndaText({ name: input.entity_name, address: input.entity_address, represented: input.signatory_name }, effectiveDate);
  const { data, error } = await sb.from('lead_nda').insert({
    lead_id: lead.id, version: NDA_VERSION, entity_name: input.entity_name, entity_address: input.entity_address,
    signatory_name: input.signatory_name, signatory_title: input.signatory_title ?? null, signatory_email: input.signatory_email ?? null,
    text_hash: ndaHash(text), signed_at: now.toISOString(), ip: input.ip ?? null, user_agent: input.user_agent ?? null,
  }).select('*').single();
  if (error) return { ok: false, error: error.code === '23505' ? 'This agreement is already signed.' : error.message };
  const nda = data as NdaRow;

  await sb.from('leads').update({ stage: 'nda_signed', nda_signed_at: now.toISOString(), next_step: 'Approve the access-request email', next_step_due: now.toISOString().slice(0, 10) }).eq('id', lead.id);
  await sb.from('lead_messages').insert({ lead_id: lead.id, direction: 'inbound', channel: 'email', status: 'logged', subject: 'NCNDA signed online', body: `Signed by ${input.signatory_name}${input.signatory_title ? `, ${input.signatory_title}` : ''} for ${input.entity_name} at ${now.toISOString()} (hash ${nda.text_hash.slice(0, 12)}).`, created_by: 'lead-nda' });

  const link = ndaLink(env, lead.id);
  const to = input.signatory_email || lead.contact_email;
  if (mailConfigured(env) && to) {
    sendEmail({
      to, subject: `${lead.brand_name} x DevShop Retail OS: NDA signed`,
      html: renderRetailOsEmail({
        preheader: 'Your signed copy, and what happens next.',
        eyebrow: 'Signed', heading: 'Thank you. We are both covered.',
        lines: [
          `The mutual Non-Compete & Non-Disclosure Agreement was signed by ${input.signatory_name} for ${input.entity_name} on ${effectiveDate}. Your copy is always at the link below.`,
          `Next, I will send a short checklist for read-only access to your store and ads. From the moment your data is connected, my target is your store live within ${LIVE_IN_DAYS} days, with results every Monday.`,
        ],
        cta: { label: 'Open your signed copy', url: link },
        note: 'Reply to this email with any question; I read every one.',
      }),
    }, env).catch((e) => console.error('nda signed email failed', e));
  }
  if (mailConfigured(env) && env.ADMIN_NOTIFY_EMAIL) {
    sendEmail({
      to: env.ADMIN_NOTIFY_EMAIL, subject: `NDA signed: ${lead.brand_name}`,
      html: renderRetailOsEmail({ preheader: `${input.signatory_name} signed for ${input.entity_name}.`, eyebrow: 'FYI', heading: `${lead.brand_name} signed the NDA`, lines: [`${input.signatory_name}${input.signatory_title ? `, ${input.signatory_title}` : ''} signed for ${input.entity_name}. The access-request email is drafted next; approve it from the notice that follows.`], cta: { label: 'Open leads', url: `${SITE}/retail-os/admin/leads` } }),
      replyTo: to ?? undefined,
    }, env).catch((e) => console.error('nda admin email failed', e));
  }

  // The journey keeps moving: the access request is drafted now (or sent, with autosend on).
  try {
    const auditLead: AuditLead = { id: lead.id, brand_name: lead.brand_name, contact_name: lead.contact_name, contact_email: lead.contact_email, contact_phone: lead.contact_phone ?? null, stage: 'nda_signed', access_requested_at: null, access_reminded_at: null };
    if (env.LEAD_TOKEN_SECRET && lead.contact_email) await requestAccess(env, sb, auditLead, notifyingApproval(env, sb, lead), now);
  } catch (e) { console.error('post-NDA access request failed', e); }

  return { ok: true, nda };
}
