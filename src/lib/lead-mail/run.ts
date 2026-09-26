// The lead email assistant, end to end: read Virat's mailbox, log every lead
// message, draft a reply in his voice inside the same Gmail thread, and ask him
// to approve it. Nothing is sent without approval (PLAYBOOK, New leads step 5).
import type { Decision, Situation } from '../brain/types';
import { buildMime, b64url, extractBody, headerMap, viratFromHeader, type GmailApi, type GmailRawMessage } from '../mail/gmail';
import { cleanTextLinks, signatureText } from '../mail/links';
import {
  addr, buildIndex, classifyIntent, contextSummary, displayName, draftReply, isAutomated, looksLikeEnquiry, matchLead,
  nextStage, replySubject, stageOnReceipt, voiceIssues, type Intent, type Lead, type MailMessage, type StagePlan,
} from './core';
import { gmailThreadUrl, type ApprovalNotice } from './notice';
import type { LeadStore } from './store';
import { signToken, verifyToken } from './token';
import { questionIn } from '../knowledge-loop';
import { stageAfterSent } from '../lead-journey';
import type { LeadMessageRow } from './store';
import type { LeadStage } from './core';

export const DEFAULT_QUERY = 'newer_than:2d -in:drafts -in:chats -in:spam -in:trash';

export type LeadBrain = {
  decide(s: Situation): Promise<Decision>;
  answer?(q: string, opts: { audience: { audience: 'public' } }): Promise<{ answer: string; known: boolean }>;
};

/** The shared question inbox (src/lib/knowledge-loop.ts). Optional: the assistant runs without it. */
export type LeadKnowledge = {
  noteUnanswered(question: string, via: 'email', ctx: { source?: string; leadId?: string }): Promise<void>;
  noteAnswered(question: string, rawAnswer: string, ctx: { source?: string; leadId?: string; answerSource?: string }): Promise<void>;
};

export type RunDeps = {
  gmail: GmailApi; store: LeadStore; brain: LeadBrain;
  mailbox: string; now: Date; baseUrl: string;
  approvalSecret: string; autosend: boolean;
  notifyVirat: (n: ApprovalNotice) => Promise<unknown>;
  knowledge?: LeadKnowledge;
  query?: string;
};

export type RunResult = { seen: number; skippedKnown: number; ignored: number; logged: number; newLeads: number; drafted: number; escalated: number; autosent: number; errors: string[] };

export function toMailMessage(r: GmailRawMessage): MailMessage {
  const h = headerMap(r.payload);
  const { text, attachments } = extractBody(r.payload);
  return {
    id: r.id, threadId: r.threadId, from: h['from'] ?? '', fromName: displayName(h['from'] ?? ''),
    to: (h['to'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    subject: h['subject'] ?? '', date: r.internalDate ? new Date(Number(r.internalDate)).toISOString() : (h['date'] ? new Date(h['date']).toISOString() : new Date().toISOString()),
    body: text, messageIdHeader: h['message-id'] ?? '', references: h['references'] ?? '', headers: h, attachments, labelIds: r.labelIds ?? [],
  };
}

const DRAFT_ACTION: Record<Intent, string> = {
  nda_signed: 'confirm receipt of their signed document and propose call times',
  nda_pending: 'ask them to reply with the signed document when ready',
  answers: 'thank them for their answers, recap them and propose call times',
  published_terms: 'point them to the published standard document and offer a call',
  high_stakes: 'needs a personal reply',
  general: 'thank them and propose a call',
};
const TAG_MAP: Record<string, string> = { negotiation: 'pricing', legal: 'legal', money: 'money', custom_terms: 'terms' };
const dueDate = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);

function brandFrom(m: MailMessage): string {
  const domain = addr(m.from).split('@')[1] ?? '';
  const free = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|proton|protonmail|rediffmail|aol)\./i.test(domain);
  if (domain && !free) return domain.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return m.fromName || addr(m.from);
}

/** One pass over the mailbox. Safe to re-run: every Gmail message id is logged once. */
export async function runLeadMail(d: RunDeps): Promise<RunResult> {
  const res: RunResult = { seen: 0, skippedKnown: 0, ignored: 0, logged: 0, newLeads: 0, drafted: 0, escalated: 0, autosent: 0, errors: [] };
  const ids = (await d.gmail.listMessageIds(d.query ?? DEFAULT_QUERY, 100)).reverse(); // oldest first
  res.seen = ids.length;
  const known = await d.store.knownGmailIds(ids.map((x) => x.id));
  const idx = buildIndex(await d.store.leads(), await d.store.threads());
  const mailbox = d.mailbox.toLowerCase();

  for (const { id } of ids) {
    if (known.has(id)) { res.skippedKnown++; continue; }
    try {
      const m = toMailMessage(await d.gmail.getMessage(id));
      const outbound = addr(m.from) === mailbox;
      let match = matchLead(m, idx, mailbox);
      if (!match) {
        if (outbound || !looksLikeEnquiry(m)) { res.ignored++; continue; }
        const lead = await d.store.createLead({ brand_name: brandFrom(m), contact_name: m.fromName || null, contact_email: addr(m.from), source: 'email', stage: 'new' });
        idx.leadsById.set(lead.id, lead); idx.leadsByEmail.set(addr(m.from), lead);
        match = { lead, via: 'email' }; res.newLeads++;
      } else if (!outbound && isAutomated(m)) { res.ignored++; continue; } // auto-reply from a known lead
      const row = await d.store.insertMessage({
        lead_id: match.lead.id, at: m.date, direction: outbound ? 'outbound' : 'inbound', channel: 'email',
        status: outbound ? 'sent' : 'logged', subject: m.subject, body: m.body || '(no text)',
        external_ref: m.id, gmail_message_id: m.id, gmail_thread_id: m.threadId, rfc_message_id: m.messageIdHeader || null,
        meta: m.attachments.length ? { attachments: m.attachments } : {},
      });
      if (!row) { res.skippedKnown++; continue; }
      res.logged++;
      idx.leadIdByThread.set(m.threadId, match.lead.id);
      if (!outbound) await handleInbound(d, match.lead, m, res);
      else await learnFromVirat(d, match.lead, m);
    } catch (e) {
      res.errors.push(`${id}: ${String(e).slice(0, 200)}`);
    }
  }
  return res;
}

async function handleInbound(d: RunDeps, lead: Lead, m: MailMessage, res: RunResult) {
  const { intent, tags } = classifyIntent(m, lead);
  const plan = nextStage(lead.stage, intent);

  // Facts on receipt (a signed NDA arrived) move the stage now; the next step waits for approval.
  const receipt = stageOnReceipt(lead.stage, intent);
  if (receipt !== lead.stage) { await d.store.updateLead(lead.id, { stage: receipt }); lead.stage = receipt; }

  const decision = await d.brain.decide({
    action: intent === 'high_stakes' ? `Reply to a lead on ${tags.join(', ')}` : 'Draft a routine reply to a lead for Virat to approve',
    // Describe what the draft does, not the lead's words: sharing the published standard
    // document is not a pricing change. Anything that is goes to Virat via `tags`.
    details: DRAFT_ACTION[intent],
    tags: tags.map((t) => TAG_MAP[t] ?? t),
  });
  const context = contextSummary(lead, m, intent, tags);

  if (intent === 'high_stakes' || decision.verdict === 'ask Virat') {
    return escalate(d, lead, m, context, decision.reasons, res);
  }

  // Grounded facts for a direct question, only if the Brain knows and it reads in Virat's voice.
  // A question the Brain cannot answer goes to the shared inbox so Virat answers it once, for every channel.
  let facts: string | null = null;
  const q = questionIn(m.body);
  if (q && intent === 'general') {
    let known = false;
    if (d.brain.answer) {
      try {
        const a = await d.brain.answer(q, { audience: { audience: 'public' } });
        const text = a.answer.replace(/\s*\[[^\]]+\]/g, '').trim();
        known = a.known;
        if (a.known && !voiceIssues(text).length && !/\d/.test(text.replace(/\b7 days\b/gi, ''))) facts = text; // no numbers beyond the standard promise
      } catch { /* answer is optional */ }
    }
    if (!known && d.knowledge) await d.knowledge.noteUnanswered(q, 'email', { source: `email:${m.threadId}`, leadId: lead.id }).catch(() => {});
  }

  const body = draftReply({ lead, message: m, intent, now: d.now, facts });
  const issues = body ? voiceIssues(body) : ['no draft'];
  if (!body || issues.length) return escalate(d, lead, m, context, [`Draft failed the voice check: ${issues.join(' ')}`], res);

  const subject = replySubject(m.subject);
  const text = cleanTextLinks(`${body}\n\n-- \n${signatureText(d.mailbox)}`);
  const raw = b64url(buildMime({ from: viratFromHeader(d.mailbox), to: m.from, subject, text, inReplyTo: m.messageIdHeader, references: m.references }));
  const draft = await d.gmail.createDraft(raw, m.threadId);
  const row = await d.store.insertMessage({
    lead_id: lead.id, direction: 'outbound', channel: 'email', status: 'awaiting_approval', subject, body: text,
    external_ref: draft.id, gmail_message_id: null, gmail_draft_id: draft.id, gmail_thread_id: m.threadId,
    meta: { intent, plan, in_reply_to: m.id }, created_by: 'lead-mail',
  });
  if (!row) return;
  res.drafted++;

  if (d.autosend && decision.verdict === 'act alone' && intent !== 'published_terms') {
    // Built for later; LEAD_AUTOSEND defaults to off and stays off until Virat says otherwise.
    const sent = await d.gmail.sendDraft(draft.id);
    await markSent(d.store, row.id, sent.id, lead.id, plan, d.now);
    res.autosent++;
    return;
  }

  const { token, payload } = signToken(row.id, d.approvalSecret, d.now.getTime());
  await d.store.saveToken(payload.n, row.id, new Date(payload.exp));
  await d.notifyVirat({
    kind: 'approval', leadName: lead.brand_name, subject: m.subject, context, draft: body,
    approveUrl: `${d.baseUrl}/api/leads/approve?t=${encodeURIComponent(token)}`, gmailUrl: gmailThreadUrl(m.threadId),
  });
}

/**
 * Virat replied to a lead himself. If the lead had asked a question in that thread, keep the
 * question and his answer together in the shared inbox, so one "reword and publish" teaches
 * the FAQ, the site chat and future email drafts. (Replies the assistant sent are already
 * logged by id, so they never reach here.)
 */
async function learnFromVirat(d: RunDeps, lead: Lead, m: MailMessage) {
  if (!d.knowledge) return;
  try {
    const thread = (await d.store.messagesFor(lead.id)).filter((x) => x.gmail_thread_id === m.threadId && x.direction === 'inbound' && x.at <= m.date);
    const asked = [...thread].reverse().map((x) => questionIn(x.body)).find(Boolean);
    if (!asked) return;
    await d.knowledge.noteAnswered(asked, m.body, { source: `email:${m.threadId}`, leadId: lead.id, answerSource: `email:${m.id}` });
  } catch (e) { console.error('lead-mail learn from Virat', e); }
}

async function escalate(d: RunDeps, lead: Lead, m: MailMessage, context: [string, string], reasons: string[], res: RunResult) {
  await d.store.insertMessage({
    lead_id: lead.id, direction: 'internal', channel: 'note', status: 'logged', subject: `Needs Virat: ${m.subject}`,
    body: `${context.join('\n')}\n${reasons.join(' ')}`, gmail_message_id: null, gmail_thread_id: m.threadId, created_by: 'lead-mail',
  });
  await d.store.updateLead(lead.id, { next_step: 'Virat to reply personally', next_step_due: dueDate(d.now, 1) });
  await d.notifyVirat({ kind: 'escalation', leadName: lead.brand_name, subject: m.subject, context, reasons, gmailUrl: gmailThreadUrl(m.threadId) });
  res.escalated++;
}

async function markSent(store: LeadStore, rowId: string, gmailId: string, leadId: string, plan: StagePlan, now: Date) {
  await store.updateMessage(rowId, { status: 'sent', gmail_message_id: gmailId, at: now.toISOString() });
  await store.updateLead(leadId, { stage: plan.stage, next_step: plan.next_step, next_step_due: dueDate(now, plan.due_days) });
}

export type ApproveResult =
  | { ok: true; leadId: string; stage: string; nextStep: string }
  | { ok: false; status: 400 | 404 | 409 | 410 | 502; reason: string };

/** Look at a link without using it (the confirm screen). */
export async function peekApproval(store: LeadStore, token: string, secret: string, now: Date) {
  const v = verifyToken(token, secret, now.getTime());
  if (!v.ok) return { ok: false as const, reason: v.reason };
  const msg = await store.getMessage(v.payload.m);
  if (!msg) return { ok: false as const, reason: 'not_found' };
  return { ok: true as const, msg };
}

/** Approve & send: verify, use the token once, send the Gmail draft, move the lead on. */
const NEXT_STEP: Record<string, string> = { nda_request: 'They sign the NDA online', nda_reminder: 'They sign the NDA online', access_request: 'They connect their data', access_reminder: 'They connect their data', plan_cover: 'They read the plan; book the call' };

export async function approve(d: { store: LeadStore; gmail: GmailApi; secret: string; now: Date; mailbox?: string; onSent?: (msg: LeadMessageRow) => Promise<void> }, token: string): Promise<ApproveResult> {
  d.mailbox = d.mailbox ?? '';
  const v = verifyToken(token, d.secret, d.now.getTime());
  if (!v.ok) return { ok: false, status: v.reason === 'expired' ? 410 : 400, reason: v.reason };
  const msg = await d.store.getMessage(v.payload.m);
  if (!msg) return { ok: false, status: 404, reason: 'not_found' };
  if (msg.status !== 'awaiting_approval') return { ok: false, status: 409, reason: 'already_handled' };
  if (!(await d.store.consumeToken(v.payload.n, d.now))) return { ok: false, status: 409, reason: 'already_used' };
  try {
    if (!msg.gmail_draft_id) {
      // A journey email parked by lead-approve.ts (NDA, access, plan): send it fresh from Gmail.
      const lead = (await d.store.leads()).find((l) => l.id === msg.lead_id);
      if (!lead?.contact_email) throw new Error('lead has no email address');
      const text = cleanTextLinks(`${msg.body}\n\n-- \n${signatureText(d.mailbox)}`);
      const raw = b64url(buildMime({ from: viratFromHeader(d.mailbox), to: lead.contact_email, subject: msg.subject ?? 'From Virat', text }));
      const sent = await d.gmail.sendRaw(raw);
      const stage = stageAfterSent(msg.purpose, lead.stage);
      await d.store.updateMessage(msg.id, { status: 'sent', gmail_message_id: sent.id, gmail_thread_id: sent.threadId, at: d.now.toISOString() });
      const stamp: Record<string, unknown> = msg.purpose === 'nda_request' ? { nda_sent_at: d.now.toISOString() } : msg.purpose === 'nda_reminder' ? { nda_reminded_at: d.now.toISOString() } : {};
      const nextStep = NEXT_STEP[msg.purpose ?? ''] ?? 'Reply and agree the next step';
      await d.store.updateLead(msg.lead_id, { stage: stage as LeadStage, next_step: nextStep, next_step_due: dueDate(d.now, 3), ...stamp } as Partial<Lead>);
      await d.onSent?.(msg);
      return { ok: true, leadId: msg.lead_id, stage, nextStep };
    }
    const sent = await d.gmail.sendDraft(msg.gmail_draft_id);
    const plan = (msg.meta?.plan as StagePlan | undefined) ?? nextStage('contacted', (msg.meta?.intent as Intent) ?? 'general');
    await markSent(d.store, msg.id, sent.id, msg.lead_id, plan, d.now);
    return { ok: true, leadId: msg.lead_id, stage: plan.stage, nextStep: plan.next_step };
  } catch (e) {
    await d.store.releaseToken(v.payload.n); // the link still works if Gmail failed
    return { ok: false, status: 502, reason: String(e).slice(0, 200) };
  }
}
