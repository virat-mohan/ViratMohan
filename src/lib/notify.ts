// The one way anything leaves the building. Every outbound message goes out
// as Virat (his email identity, his WhatsApp number), never a bot name.
// Decent hours only: 9am–8pm IST, Monday–Saturday. Outside that the message
// waits in `outbox` with send_after = the next open slot, and the outbox cron
// sends it. The one exception is an immediate reply to a team member who has
// just messaged in (they are awake, and they asked).
// Statements go by email; short time-sensitive notes ("payout sent") by WhatsApp.
import { sendEmail } from './email';
import { OverQuotaError } from './mail/send';

export type Outbound =
  | { channel: 'email'; to: string; subject: string; html: string; dedupeKey?: string }
  | { channel: 'whatsapp'; to: string; text: string; dedupeKey?: string; template?: { name: string; lang: string; params: string[] } };

export type NotifyDeps = {
  now: Date;
  sendEmail: (to: string, subject: string, html: string) => Promise<void>;
  sendWhatsApp: (to: string, text: string, template?: { name: string; lang: string; params: string[] }) => Promise<void>;
  enqueue: (m: Outbound, sendAfter: Date) => Promise<void>;
};

export { isOpenHours, nextOpenSlot, OPEN_HOUR, CLOSE_HOUR } from './notify-hours';
import { isOpenHours, nextOpenSlot } from './notify-hours';

export async function notify(m: Outbound, deps: NotifyDeps, opts: { replyToInbound?: boolean } = {}): Promise<'sent' | 'queued'> {
  const immediate = opts.replyToInbound && m.channel === 'whatsapp';
  if (!immediate && !isOpenHours(deps.now)) {
    await deps.enqueue(m, nextOpenSlot(deps.now));
    return 'queued';
  }
  if (m.channel === 'email') await deps.sendEmail(m.to, m.subject, m.html);
  else await deps.sendWhatsApp(m.to, m.text, m.template);
  return 'sent';
}

// ── Real transports ─────────────────────────────────────────────────────────
export type NotifyEnv = {
  RESEND_API_KEY: string; RESEND_FROM_EMAIL: string;
  WHATSAPP_TOKEN: string; WHATSAPP_PHONE_NUMBER_ID: string;
};

/** Always "Virat Mohan <address>", whatever display name the env carries. */
export function viratFrom(fromEnv: string): string {
  const addr = /<([^>]+)>/.exec(fromEnv)?.[1] ?? fromEnv.trim();
  return `Virat Mohan <${addr}>`;
}

export async function sendWhatsAppCloud(env: NotifyEnv, to: string, text: string, template?: { name: string; lang: string; params: string[] }, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) throw new Error('WhatsApp is not configured');
  const body = template
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: template.name, language: { code: template.lang }, components: [{ type: 'body', parameters: template.params.map((t) => ({ type: 'text', text: t })) }] } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } };
  const res = await fetchImpl(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status} ${await res.text().catch(() => '')}`);
}

type Sb = { from: (t: string) => any };

export function liveDeps(env: NotifyEnv, sb: Sb, now = new Date()): NotifyDeps {
  return {
    now,
    sendEmail: async (to, subject, html) => { await sendEmail({ to, subject, html }, { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM_EMAIL: viratFrom(env.RESEND_FROM_EMAIL) }); },
    sendWhatsApp: (to, text, template) => sendWhatsAppCloud(env, to, text, template),
    enqueue: async (m, sendAfter) => {
      const row = {
        channel: m.channel, recipient: m.to, subject: m.channel === 'email' ? m.subject : null,
        body: m.channel === 'email' ? m.html : JSON.stringify({ text: m.text, template: m.template ?? null }),
        dedupe_key: m.dedupeKey ?? null, send_after: sendAfter.toISOString(),
      };
      const { error } = await sb.from('outbox').upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}

/** Send everything in the outbox that is due. Run by the outbox cron. */
export async function flushOutbox(env: NotifyEnv, sb: Sb, now = new Date()): Promise<{ sent: number; failed: number }> {
  if (!isOpenHours(now)) return { sent: 0, failed: 0 };
  const deps = liveDeps(env, sb, now);
  const { data, error } = await sb.from('outbox').select('*').eq('status', 'queued').lte('send_after', now.toISOString()).order('send_after').limit(100);
  if (error) throw error;
  let sent = 0, failed = 0;
  for (const r of data ?? []) {
    try {
      if (r.channel === 'email') await sendEmail({ to: r.recipient, subject: r.subject ?? '', html: r.body }, { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM_EMAIL: viratFrom(env.RESEND_FROM_EMAIL) }, { onOverQuota: 'throw' });
      else { const b = JSON.parse(r.body); await deps.sendWhatsApp(r.recipient, b.text, b.template ?? undefined); }
      await sb.from('outbox').update({ status: 'sent', sent_at: now.toISOString(), attempts: r.attempts + 1 }).eq('id', r.id);
      sent++;
    } catch (err) {
      if (err instanceof OverQuotaError) { await sb.from('outbox').update({ send_after: err.retryAt.toISOString() }).eq('id', r.id); continue; }
      await sb.from('outbox').update({ status: r.attempts + 1 >= 5 ? 'failed' : 'queued', attempts: r.attempts + 1, last_error: String(err).slice(0, 500) }).eq('id', r.id);
      failed++;
    }
  }
  return { sent, failed };
}
