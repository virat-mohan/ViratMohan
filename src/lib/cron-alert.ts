// Scheduled-job failure alerts. Monitoring only: it tells Virat a cron job failed and does
// nothing else (no retries, no changes to what the job does or returns).
//
// One alert per job per IST day. The job's key (cron-fail:<job>:<date>) is claimed in the
// outbox's unique dedupe_key, the same guard notify() uses for queued messages. Inside
// decent hours the alert is sent at once; outside them it waits in the outbox like any
// notify() message and the outbox cron sends it at the next open slot.
import type { APIRoute } from 'astro';
import { getEnv } from './env';
import { sendEmail } from './email';
import { serviceDb } from './ledger';
import { isOpenHours, nextOpenSlot } from './notify-hours';
import { renderRetailOsEmail } from './retail-os-email';
import { json } from './retail-os-http';

/** Short, with anything that looks like an email, phone/card number or token removed. */
export function sanitizeDetail(s: string): string {
  return s
    .replace(/[^\s@<>"']+@[^\s@<>"']+/g, '[email]')
    .replace(/\+?\d[\d\s-]{5,}\d/g, '[number]')
    .replace(/[A-Za-z0-9_\-.=]{24,}/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

const istDate = (now: Date) => new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

export type AlertRow = { key: string; to: string; subject: string; html: string; status: 'sent' | 'queued'; sendAfter: Date };
export type AlertDeps = {
  now: Date;
  to: string;
  /** Insert the outbox row; false if this key already exists (already alerted today). */
  claim: (row: AlertRow) => Promise<boolean>;
  send: (to: string, subject: string, html: string) => Promise<void>;
  markFailed: (key: string, error: string) => Promise<void>;
};
export type AlertResult = 'sent' | 'queued' | 'duplicate' | 'failed' | 'no-recipient';

export async function alertCronFailure(job: string, detail: string, d: AlertDeps): Promise<AlertResult> {
  if (!d.to) return 'no-recipient';
  const key = `cron-fail:${job}:${istDate(d.now)}`;
  const safe = sanitizeDetail(detail) || 'No detail';
  const subject = `Scheduled job failed: ${job}`;
  const html = renderRetailOsEmail({
    preheader: `${job} failed. Details in Vercel logs.`,
    eyebrow: 'Scheduled job',
    heading: `${job} failed`,
    lines: [
      `When: ${d.now.toISOString()}`,
      `What it said: ${safe}`,
      'Full details are in the Vercel function logs. This is the only alert for this job today.',
    ],
  });
  const open = isOpenHours(d.now);
  try {
    const claimed = await d.claim({ key, to: d.to, subject, html, status: open ? 'sent' : 'queued', sendAfter: open ? d.now : nextOpenSlot(d.now) });
    if (!claimed) return 'duplicate';
    if (!open) return 'queued';
    await d.send(d.to, subject, html);
    return 'sent';
  } catch (err) {
    await d.markFailed(key, sanitizeDetail(String(err))).catch(() => {});
    return 'failed';
  }
}

function liveAlertDeps(now: Date): AlertDeps | null {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const sb = serviceDb(env);
  return {
    now,
    to: env.ADMIN_NOTIFY_EMAIL,
    claim: async (r) => {
      const { data, error } = await sb.from('outbox').upsert({
        channel: 'email', recipient: r.to, subject: r.subject, body: r.html, dedupe_key: r.key,
        send_after: r.sendAfter.toISOString(), status: r.status, sent_at: r.status === 'sent' ? now.toISOString() : null,
      }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    send: async (to, subject, html) => { await sendEmail({ to, subject, html }, env); },
    markFailed: async (key, error) => { await sb.from('outbox').update({ status: 'failed', last_error: error }).eq('dedupe_key', key); },
  };
}

/** Never throws: an alert problem must not change the job's own response. */
async function alertLive(job: string, detail: string): Promise<void> {
  try {
    const deps = liveAlertDeps(new Date());
    const r = deps ? await alertCronFailure(job, detail, deps) : 'no-recipient';
    if (r === 'failed' || r === 'no-recipient') console.error(`cron alert not sent (${r})`, job);
  } catch (err) {
    console.error('cron alert error', job, err);
  }
}

export type CronAlertOpts = {
  /** For jobs that report a failure inside a 200 body: return a short reason, or null if fine. */
  failureIn?: (body: unknown) => string | null;
  alert?: (job: string, detail: string) => Promise<void>;
};

/** Wrap a cron handler. The handler's response is returned unchanged; a thrown error becomes a 500. */
export function withCronAlert(job: string, handler: APIRoute, opts: CronAlertOpts = {}): APIRoute {
  const alert = opts.alert ?? alertLive;
  return async (ctx) => {
    let res: Response;
    try {
      res = await handler(ctx);
    } catch (err) {
      console.error(`${job} cron failed`, err);
      await alert(job, err instanceof Error ? err.message : String(err));
      return json({ error: `${job} failed` }, 500);
    }
    if (res.status >= 500) {
      await alert(job, `HTTP ${res.status}: ${await res.clone().text().catch(() => '')}`);
    } else if (res.status < 300 && opts.failureIn) {
      const body = await res.clone().json().catch(() => null);
      const why = body == null ? null : opts.failureIn(body);
      if (why) await alert(job, why);
    }
    return res;
  };
}
