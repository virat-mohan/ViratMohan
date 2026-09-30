// Persistence for the lead email assistant: leads, lead_messages, approval tokens,
// sync state. MemoryLeadStore backs the unit tests; SupabaseLeadStore is live.
import type { Lead, LeadStage } from './core';

export type LeadMessageRow = {
  id: string; lead_id: string; at: string;
  direction: 'outbound' | 'inbound' | 'internal';
  channel: 'email' | 'whatsapp' | 'call' | 'meeting' | 'site_chat' | 'note';
  status: 'draft' | 'awaiting_approval' | 'sent' | 'logged';
  subject: string | null; body: string; external_ref: string | null; created_by: string;
  gmail_message_id: string | null; gmail_thread_id: string | null; gmail_draft_id: string | null; rfc_message_id: string | null;
  meta: Record<string, unknown>;
};
export type NewMessage = Omit<LeadMessageRow, 'id' | 'at' | 'external_ref' | 'created_by' | 'gmail_draft_id' | 'rfc_message_id' | 'meta'> & Partial<Pick<LeadMessageRow, 'at' | 'external_ref' | 'created_by' | 'gmail_draft_id' | 'rfc_message_id' | 'meta'>>;

export interface LeadStore {
  leads(): Promise<Lead[]>;
  threads(): Promise<{ lead_id: string; gmail_thread_id: string }[]>;
  knownGmailIds(ids: string[]): Promise<Set<string>>;
  createLead(l: { brand_name: string; contact_name: string | null; contact_email: string; source: string; stage: LeadStage }): Promise<Lead>;
  updateLead(id: string, patch: Partial<Pick<Lead, 'stage' | 'next_step' | 'next_step_due'>> & Record<string, unknown>): Promise<void>;
  /** Insert unless a row with the same gmail_message_id exists. Returns null on duplicate. */
  insertMessage(m: NewMessage): Promise<LeadMessageRow | null>;
  getMessage(id: string): Promise<LeadMessageRow | null>;
  updateMessage(id: string, patch: Partial<LeadMessageRow>): Promise<void>;
  messagesFor(leadId: string): Promise<LeadMessageRow[]>;
  saveToken(nonce: string, messageId: string, expiresAt: Date): Promise<void>;
  /** Atomically mark a token used. False if unknown or already used. */
  consumeToken(nonce: string, now: Date): Promise<boolean>;
  releaseToken(nonce: string): Promise<void>;
  saveState(mailbox: string, s: { history_id?: string | null; last_result: Record<string, unknown>; last_run_at: string }): Promise<void>;
}

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export class MemoryLeadStore implements LeadStore {
  leadRows: Lead[] = []; msgs: LeadMessageRow[] = []; tokens = new Map<string, { m: string; exp: Date; used: Date | null }>(); state: Record<string, unknown> = {};
  constructor(leads: Lead[] = []) { this.leadRows = leads; }
  async leads() { return this.leadRows; }
  async threads() { return this.msgs.filter((m) => m.gmail_thread_id).map((m) => ({ lead_id: m.lead_id, gmail_thread_id: m.gmail_thread_id! })); }
  async knownGmailIds(ids: string[]) { return new Set(this.msgs.map((m) => m.gmail_message_id).filter((x): x is string => !!x && ids.includes(x))); }
  async createLead(l: { brand_name: string; contact_name: string | null; contact_email: string; source: string; stage: LeadStage }) {
    const row: Lead = { id: uid(), brand_name: l.brand_name, contact_name: l.contact_name, contact_email: l.contact_email, stage: l.stage, next_step: null, next_step_due: null };
    this.leadRows.push(row); return row;
  }
  async updateLead(id: string, patch: Partial<Lead>) { Object.assign(this.leadRows.find((l) => l.id === id)!, patch); }
  async insertMessage(m: NewMessage) {
    if (m.gmail_message_id && this.msgs.some((x) => x.gmail_message_id === m.gmail_message_id)) return null;
    const row: LeadMessageRow = { id: uid(), at: new Date().toISOString(), external_ref: null, created_by: 'system', gmail_draft_id: null, rfc_message_id: null, meta: {}, ...m };
    this.msgs.push(row); return row;
  }
  async getMessage(id: string) { return this.msgs.find((m) => m.id === id) ?? null; }
  async updateMessage(id: string, patch: Partial<LeadMessageRow>) { Object.assign(this.msgs.find((m) => m.id === id)!, patch); }
  async messagesFor(leadId: string) { return this.msgs.filter((m) => m.lead_id === leadId); }
  async saveToken(nonce: string, m: string, exp: Date) { this.tokens.set(nonce, { m, exp, used: null }); }
  async consumeToken(nonce: string, now: Date) { const t = this.tokens.get(nonce); if (!t || t.used) return false; t.used = now; return true; }
  async releaseToken(nonce: string) { const t = this.tokens.get(nonce); if (t) t.used = null; }
  async saveState(mailbox: string, s: Record<string, unknown>) { this.state[mailbox] = s; }
}

type Sb = { from: (t: string) => any };
const must = <T>(r: { data: T; error: unknown }): T => { if (r.error) throw r.error; return r.data; };
const LEAD_COLS = 'id, brand_name, contact_name, contact_email, stage, next_step, next_step_due';

export class SupabaseLeadStore implements LeadStore {
  constructor(private sb: Sb) {}
  async leads() { return must<Lead[]>(await this.sb.from('leads').select(LEAD_COLS)) ?? []; }
  async threads() { return must<{ lead_id: string; gmail_thread_id: string }[]>(await this.sb.from('lead_messages').select('lead_id, gmail_thread_id').not('gmail_thread_id', 'is', null)) ?? []; }
  async knownGmailIds(ids: string[]) {
    if (!ids.length) return new Set<string>();
    const rows = must<{ gmail_message_id: string }[]>(await this.sb.from('lead_messages').select('gmail_message_id').in('gmail_message_id', ids)) ?? [];
    return new Set(rows.map((r) => r.gmail_message_id));
  }
  async createLead(l: { brand_name: string; contact_name: string | null; contact_email: string; source: string; stage: LeadStage }) {
    return must<Lead>(await this.sb.from('leads').insert(l).select(LEAD_COLS).single());
  }
  async updateLead(id: string, patch: Partial<Lead>) { must(await this.sb.from('leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)); }
  async insertMessage(m: NewMessage) {
    const r = await this.sb.from('lead_messages').insert(m).select('*').single();
    if (r.error && (r.error as { code?: string }).code === '23505') return null; // unique gmail_message_id: already logged
    return must<LeadMessageRow>(r);
  }
  async getMessage(id: string) { return must<LeadMessageRow | null>(await this.sb.from('lead_messages').select('*').eq('id', id).maybeSingle()); }
  async updateMessage(id: string, patch: Partial<LeadMessageRow>) { must(await this.sb.from('lead_messages').update(patch).eq('id', id)); }
  async messagesFor(leadId: string) { return must<LeadMessageRow[]>(await this.sb.from('lead_messages').select('*').eq('lead_id', leadId).order('at')) ?? []; }
  async saveToken(nonce: string, messageId: string, expiresAt: Date) { must(await this.sb.from('lead_approval_tokens').insert({ nonce, message_id: messageId, expires_at: expiresAt.toISOString() })); }
  async consumeToken(nonce: string, now: Date) {
    const rows = must<{ nonce: string }[]>(await this.sb.from('lead_approval_tokens').update({ used_at: now.toISOString() }).eq('nonce', nonce).is('used_at', null).select('nonce'));
    return (rows ?? []).length === 1;
  }
  async releaseToken(nonce: string) { must(await this.sb.from('lead_approval_tokens').update({ used_at: null }).eq('nonce', nonce)); }
  async saveState(mailbox: string, s: { history_id?: string | null; last_result: Record<string, unknown>; last_run_at: string }) {
    must(await this.sb.from('lead_mail_state').upsert({ mailbox, ...s }, { onConflict: 'mailbox' }));
  }
}
