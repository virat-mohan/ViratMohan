// Production wiring for the lead email assistant.
import type { Env } from '../env';
import { serviceDb } from '../ledger';
import { liveDeps, notify } from '../notify';
import { liveGmail } from '../mail/send';
import { serverBrain } from '../brain';
import { decide } from '../brain/decide';
import { SupabaseLeadStore } from './store';
import { knowledgeLoop } from '../knowledge-loop';
import { noticeEmailHtml, noticeSubject, noticeText, type ApprovalNotice } from './notice';
import type { LeadBrain, RunDeps } from './run';

/** Approval requests go by the playbook: WhatsApp if Virat's number is set up, else email. Quiet hours respected by notify(). */
export function viratNotifier(env: Env, now: Date) {
  const sb = serviceDb(env);
  const deps = liveDeps(env, sb, now);
  const wa = !!(env.VIRAT_WHATSAPP_TO && env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  const email = env.ADMIN_NOTIFY_EMAIL || env.GMAIL_ADDRESS;
  return (n: ApprovalNotice) => {
    const dedupeKey = `lead-mail:${n.kind}:${n.gmailUrl}:${n.approveUrl ?? ''}`.slice(0, 200);
    if (wa) return notify({ channel: 'whatsapp', to: env.VIRAT_WHATSAPP_TO, text: noticeText(n), dedupeKey }, deps);
    return notify({ channel: 'email', to: email, subject: noticeSubject(n), html: noticeEmailHtml(n), dedupeKey }, deps);
  };
}

export async function liveRunDeps(env: Env, baseUrl: string, now = new Date()): Promise<RunDeps | { error: string }> {
  if (!env.LEAD_APPROVAL_SECRET) return { error: 'LEAD_APPROVAL_SECRET is not set' };
  const gmail = await liveGmail(env);
  if (!gmail) return { error: 'Gmail is not connected (GMAIL_* env vars or /api/admin/gmail/connect)' };
  let brain: LeadBrain = { decide: async (s) => decide(s) };
  try { const b = serverBrain(env); brain = { decide: b.decide, answer: b.answer }; } catch { /* deterministic decide still runs */ }
  return {
    gmail, brain, store: new SupabaseLeadStore(serviceDb(env)), mailbox: env.GMAIL_ADDRESS, now, baseUrl,
    approvalSecret: env.LEAD_APPROVAL_SECRET, autosend: env.LEAD_AUTOSEND === 'on',
    notifyVirat: viratNotifier(env, now),
    knowledge: knowledgeLoop(env), // same question inbox and answers as the site chat
  };
}
