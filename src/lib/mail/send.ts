// Every outbound email goes through deliver(): Gmail as Virat first, Resend only
// as a logged fallback when Gmail isn't configured, and a daily quota guard so
// the consumer Gmail limit (about 500 recipients a day) is never hit.
import { createClient } from '@supabase/supabase-js';
import { buildMime, b64url, fetchGmail, gmailConfigured, htmlToText, openToken, viratFromHeader, type GmailApi } from './gmail';
import { nextOpenSlot } from '../notify-hours';
import { cleanLinks, cleanTextLinks } from './links';

export const DAILY_CAP = 400; // guard below Gmail's ~500/day so replies to leads always have room

export type MailEnv = {
  GMAIL_CLIENT_ID?: string; GMAIL_CLIENT_SECRET?: string; GMAIL_REFRESH_TOKEN?: string; GMAIL_ADDRESS?: string; GMAIL_TOKEN_KEY?: string;
  RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string;
  SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type MailInput = { to: string; subject: string; html?: string; text?: string; replyTo?: string };

export class OverQuotaError extends Error { constructor(public retryAt: Date) { super('Daily Gmail send guard reached'); } }

export interface QuotaStore { reserve(day: string, n: number, cap: number): Promise<boolean> }

export type MailDeps = {
  now: Date;
  gmail: GmailApi | null; address: string;
  quota: QuotaStore | null;
  enqueue: ((m: MailInput, sendAfter: Date) => Promise<void>) | null;
  resend: ((m: MailInput) => Promise<void>) | null;
  log?: (msg: string) => void;
};

export const quotaDay = (now: Date) => now.toISOString().slice(0, 10);

/** First open slot (9am IST, Mon–Sat) on the next UTC day, when the counter has reset. */
export function nextQuotaSlot(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return nextOpenSlot(d);
}

export type Delivery = 'gmail' | 'resend' | 'queued';

export async function deliver(m: MailInput, deps: MailDeps, opts: { onOverQuota?: 'enqueue' | 'throw' } = {}): Promise<Delivery> {
  const log = deps.log ?? ((s: string) => console.warn(s));
  // Every email passes through cleanLinks(): no google.com/url wrappers, https only.
  m = { ...m, html: m.html ? cleanLinks(m.html) : undefined };
  const text = cleanTextLinks(m.text ?? (m.html ? htmlToText(m.html) : ''));
  m = { ...m, text };
  if (deps.gmail && deps.address) {
    const recipients = m.to.split(',').filter((x) => x.trim()).length || 1;
    let ok = true;
    if (deps.quota) {
      try { ok = await deps.quota.reserve(quotaDay(deps.now), recipients, DAILY_CAP); }
      catch (e) { log(`mail: quota counter unavailable, sending anyway (${String(e).slice(0, 120)})`); }
    }
    if (!ok) {
      const at = nextQuotaSlot(deps.now);
      if (opts.onOverQuota === 'throw' || !deps.enqueue) throw new OverQuotaError(at);
      await deps.enqueue(m, at);
      log(`mail: daily guard of ${DAILY_CAP} reached, queued "${m.subject}" until ${at.toISOString()}`);
      return 'queued';
    }
    const raw = buildMime({ from: viratFromHeader(deps.address), to: m.to, subject: m.subject, text, html: m.html, replyTo: m.replyTo });
    await deps.gmail.sendRaw(b64url(raw));
    return 'gmail';
  }
  if (!deps.resend) throw new Error('No email transport configured (set the GMAIL_* variables)');
  log(`mail: Gmail not configured, fell back to Resend for "${m.subject}"`);
  await deps.resend(m);
  return 'resend';
}

// ── Live wiring ─────────────────────────────────────────────────────────────
type Sb = ReturnType<typeof createClient>;
const sbOf = (e: MailEnv): Sb | null => (e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY ? createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null);

/** Refresh token: the Vercel env var wins if set; otherwise the sealed one saved by /api/admin/gmail/connect. */
export async function refreshTokenFor(e: MailEnv, sb: Sb | null): Promise<string | null> {
  if (e.GMAIL_REFRESH_TOKEN) return e.GMAIL_REFRESH_TOKEN;
  if (!sb || !e.GMAIL_TOKEN_KEY || !e.GMAIL_ADDRESS) return null;
  const { data, error } = await sb.from('gmail_credentials').select('refresh_token_sealed').eq('mailbox', e.GMAIL_ADDRESS.toLowerCase()).maybeSingle();
  if (error || !data) return null;
  try { return openToken((data as { refresh_token_sealed: string }).refresh_token_sealed, e.GMAIL_TOKEN_KEY); } catch { return null; }
}

export async function liveGmail(e: MailEnv, sb = sbOf(e)): Promise<GmailApi | null> {
  if (!gmailConfigured(e)) return null;
  const rt = await refreshTokenFor(e, sb);
  if (!rt) return null;
  return fetchGmail({ clientId: e.GMAIL_CLIENT_ID!, clientSecret: e.GMAIL_CLIENT_SECRET!, refreshToken: rt, address: e.GMAIL_ADDRESS! });
}

export function supabaseQuota(sb: Sb): QuotaStore {
  return {
    async reserve(day, n, cap) {
      const { data, error } = await (sb as any).rpc('reserve_mail_quota', { p_day: day, p_n: n, p_cap: cap });
      if (error) throw error;
      return data === true;
    },
  };
}

async function resendSend(e: MailEnv, m: MailInput) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${e.RESEND_API_KEY}` },
    body: JSON.stringify({ from: e.RESEND_FROM_EMAIL, to: [m.to], subject: m.subject, html: m.html, text: m.text ?? (m.html ? htmlToText(m.html) : ''), ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend API error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 500)}`);
}

export async function liveMailDeps(e: MailEnv, now = new Date()): Promise<MailDeps> {
  const sb = sbOf(e);
  return {
    now,
    gmail: await liveGmail(e, sb),
    address: e.GMAIL_ADDRESS ?? '',
    quota: sb ? supabaseQuota(sb) : null,
    enqueue: sb ? async (m, at) => {
      const { error } = await (sb as any).from('outbox').insert({ channel: 'email', recipient: m.to, subject: m.subject, body: m.html ?? m.text ?? '', send_after: at.toISOString() });
      if (error) throw error;
    } : null,
    resend: e.RESEND_API_KEY && e.RESEND_FROM_EMAIL ? (m) => resendSend(e, m) : null,
  };
}

/** Can the site send email at all? (Gmail set up, or the Resend fallback.) */
export const mailConfigured = (e: MailEnv) => gmailConfigured(e) || !!(e.RESEND_API_KEY && e.RESEND_FROM_EMAIL);
