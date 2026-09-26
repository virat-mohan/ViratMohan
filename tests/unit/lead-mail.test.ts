import { describe, it, expect, vi } from 'vitest';
import { buildIndex, classifyIntent, draftReply, isAutomated, matchLead, nextStage, voiceIssues, type Lead, type MailMessage } from '../../src/lib/lead-mail/core';
import { MemoryLeadStore } from '../../src/lib/lead-mail/store';
import { approve, runLeadMail, type RunDeps } from '../../src/lib/lead-mail/run';
import { signToken, verifyToken } from '../../src/lib/lead-mail/token';
import { decide } from '../../src/lib/brain/decide';
import { fromB64url, type GmailApi, type GmailRawMessage } from '../../src/lib/mail/gmail';
import { noticeEmailHtml, noticeText } from '../../src/lib/lead-mail/notice';

const ME = 'viratmohan@gmail.com';
const SECRET = 'test-secret';
const NOW = new Date('2026-09-28T06:00:00Z'); // Monday 11:30 IST

const lead = (p: Partial<Lead> = {}): Lead => ({ id: 'lead-1', brand_name: 'Kora Living', contact_name: 'Asha Rao', contact_email: 'asha@koraliving.in', stage: 'new', next_step: null, next_step_due: null, ...p });
const msg = (p: Partial<MailMessage> = {}): MailMessage => ({
  id: 'g1', threadId: 't1', from: 'Asha Rao <asha@koraliving.in>', fromName: 'Asha Rao', to: [ME], subject: 'Hello', date: NOW.toISOString(),
  body: 'Hi Virat, keen to talk.', messageIdHeader: '<m1@mail.gmail.com>', references: '', headers: {}, attachments: [], labelIds: ['INBOX'], ...p,
});

const b64 = (s: string) => Buffer.from(s).toString('base64url');
function raw(p: { id: string; thread: string; from: string; subject: string; body: string; headers?: Record<string, string>; attach?: string; labels?: string[] }): GmailRawMessage {
  const headers = [{ name: 'From', value: p.from }, { name: 'To', value: ME }, { name: 'Subject', value: p.subject }, { name: 'Message-ID', value: `<${p.id}@mail>` },
    ...Object.entries(p.headers ?? {}).map(([name, value]) => ({ name, value }))];
  const parts = [{ mimeType: 'text/plain', body: { data: b64(p.body) } }, ...(p.attach ? [{ mimeType: 'application/pdf', filename: p.attach, body: { attachmentId: 'a1' } }] : [])];
  return { id: p.id, threadId: p.thread, labelIds: p.labels ?? ['INBOX'], internalDate: String(NOW.getTime()), payload: { mimeType: 'multipart/mixed', headers, parts } };
}

function mockGmail(msgs: GmailRawMessage[]) {
  const drafts: { id: string; raw: string; threadId?: string }[] = [];
  const api: GmailApi & { drafts: typeof drafts; sent: string[] } = {
    drafts, sent: [],
    listMessageIds: vi.fn(async () => msgs.map((m) => ({ id: m.id, threadId: m.threadId })).reverse()),
    getMessage: vi.fn(async (id: string) => msgs.find((m) => m.id === id)!),
    createDraft: vi.fn(async (r: string, threadId?: string) => { const id = `d${drafts.length + 1}`; drafts.push({ id, raw: r, threadId }); return { id, messageId: `dm${drafts.length}` }; }),
    sendDraft: vi.fn(async (id: string) => { api.sent.push(id); return { id: `sent-${id}`, threadId: 't' }; }),
    sendRaw: vi.fn(async () => { throw new Error('sendRaw must not be called by the lead assistant'); }),
    profile: vi.fn(async () => ({ emailAddress: ME, historyId: '1' })),
  };
  return api;
}

function deps(gmail: GmailApi, store: MemoryLeadStore, extra: Partial<RunDeps> = {}) {
  const notices: Parameters<RunDeps['notifyVirat']>[0][] = [];
  const d: RunDeps = {
    gmail, store, mailbox: ME, now: NOW, baseUrl: 'https://viratmohan.com', approvalSecret: SECRET, autosend: false,
    brain: { decide: async (s) => decide(s) }, notifyVirat: async (n) => { notices.push(n); }, ...extra,
  };
  return { d, notices };
}

describe('thread matching', () => {
  const idx = buildIndex([lead(), lead({ id: 'lead-2', contact_email: 'raj@x.com', brand_name: 'X' })], [{ lead_id: 'lead-2', gmail_thread_id: 'tX' }]);
  it('matches by sender email, case-insensitively', () => {
    expect(matchLead(msg({ from: 'ASHA@KoraLiving.in' }), idx, ME)?.lead.id).toBe('lead-1');
  });
  it('matches an existing lead thread even from a new address', () => {
    expect(matchLead(msg({ from: 'colleague@other.com', threadId: 'tX' }), idx, ME)).toEqual({ lead: expect.objectContaining({ id: 'lead-2' }), via: 'thread' });
  });
  it('matches outbound mail by recipient', () => {
    expect(matchLead(msg({ from: `Virat <${ME}>`, to: ['raj@x.com'], threadId: 'new' }), idx, ME)?.lead.id).toBe('lead-2');
  });
  it('does not match strangers', () => {
    expect(matchLead(msg({ from: 'someone@else.com', threadId: 'nope' }), idx, ME)).toBeNull();
  });
  it('flags newsletters and auto-replies', () => {
    expect(isAutomated(msg({ headers: { 'list-unsubscribe': '<mailto:x>' } }))).toBe(true);
    expect(isAutomated(msg({ headers: { 'auto-submitted': 'auto-replied' } }))).toBe(true);
    expect(isAutomated(msg({ subject: 'Out of office: back Monday' }))).toBe(true);
    expect(isAutomated(msg())).toBe(false);
  });
});

describe('cron run: idempotency and new leads', () => {
  it('logs each Gmail message once across re-runs', async () => {
    const store = new MemoryLeadStore([lead({ stage: 'nda_sent' })]);
    const gmail = mockGmail([raw({ id: 'm1', thread: 't1', from: 'Asha <asha@koraliving.in>', subject: 'NDA', body: 'Signed copy attached.', attach: 'Kora_NDA_signed.pdf' })]);
    const { d } = deps(gmail, store);
    const first = await runLeadMail(d);
    const second = await runLeadMail(d);
    expect(first.logged).toBe(1);
    expect(first.drafted).toBe(1);
    expect(second.logged).toBe(0);
    expect(second.skippedKnown).toBe(1);
    expect(store.msgs.filter((m) => m.gmail_message_id === 'm1')).toHaveLength(1);
    expect(gmail.drafts).toHaveLength(1);
  });

  it('ignores newsletters and strangers, but creates a lead for a business enquiry', async () => {
    const store = new MemoryLeadStore([]);
    const gmail = mockGmail([
      raw({ id: 'n1', thread: 'a', from: 'news@brand.com', subject: 'Weekly digest', body: 'Our brand news', headers: { 'List-Unsubscribe': '<x>' } }),
      raw({ id: 'n2', thread: 'b', from: 'friend@gmail.com', subject: 'Dinner?', body: 'Free on Friday?' }),
      raw({ id: 'n3', thread: 'c', from: 'Meera <meera@sutrahome.in>', subject: 'Retail OS for my brand', body: 'I run a home decor label and would love to work with you.' }),
    ]);
    const r = await runLeadMail(deps(gmail, store).d);
    expect(r.ignored).toBe(2);
    expect(r.newLeads).toBe(1);
    expect(store.leadRows[0]).toMatchObject({ contact_email: 'meera@sutrahome.in', stage: 'new', brand_name: 'Sutrahome' });
  });

  it('drafts in the same thread with In-Reply-To and References', async () => {
    const store = new MemoryLeadStore([lead()]);
    const gmail = mockGmail([raw({ id: 'm9', thread: 'T9', from: 'asha@koraliving.in', subject: 'Question', body: 'Keen to talk about launching.', headers: { References: '<r0@mail>' } })]);
    await runLeadMail(deps(gmail, store).d);
    const mime = fromB64url(gmail.drafts[0].raw);
    expect(gmail.drafts[0].threadId).toBe('T9');
    expect(mime).toContain('In-Reply-To: <m9@mail>');
    expect(mime).toContain('References: <r0@mail> <m9@mail>');
    expect(mime).toContain('Subject: Re: Question');
    expect(mime).toContain('From: Virat Mohan <viratmohan@gmail.com>');
    expect(store.msgs.find((m) => m.status === 'awaiting_approval')).toBeTruthy();
    expect(gmail.sendDraft).not.toHaveBeenCalled();
  });
});

describe('stage transitions', () => {
  it('signed NDA moves nda_sent to nda_signed on receipt', async () => {
    const store = new MemoryLeadStore([lead({ stage: 'nda_sent' })]);
    const gmail = mockGmail([raw({ id: 'm1', thread: 't1', from: 'asha@koraliving.in', subject: 'Re: NDA', body: 'Signed and attached.', attach: 'NDA-signed.pdf' })]);
    const { d, notices } = deps(gmail, store);
    await runLeadMail(d);
    expect(store.leadRows[0].stage).toBe('nda_signed');
    expect(notices[0].kind).toBe('approval');
    expect(notices[0].draft).toMatch(/signed NDA/);
  });
  it('answers move the lead to discovery; stages never go backwards', () => {
    expect(nextStage('nda_signed', 'answers').stage).toBe('discovery');
    expect(nextStage('proposal', 'answers').stage).toBe('proposal');
    expect(nextStage('won', 'general').stage).toBe('won');
    expect(nextStage('nda_sent', 'nda_pending').stage).toBe('nda_sent');
  });
  it('classifies answers and pricing questions', () => {
    expect(classifyIntent(msg({ body: '1. We sell candles\n2. Mostly Instagram\n3. About two years' }), lead({ stage: 'nda_signed' })).intent).toBe('answers');
    expect(classifyIntent(msg({ body: 'What does it cost?' }), lead()).intent).toBe('published_terms');
  });
});

describe('high stakes go to Virat', () => {
  for (const body of ['Can you lower the split to 10%?', 'My lawyer wants to redline clause 4.', 'Can I pay you ₹50,000 upfront?', 'Could we agree custom terms with exclusivity?']) {
    it(`no draft for: ${body}`, async () => {
      const store = new MemoryLeadStore([lead({ stage: 'discovery' })]);
      const gmail = mockGmail([raw({ id: 'h1', thread: 'th', from: 'asha@koraliving.in', subject: 'Terms', body })]);
      const { d, notices } = deps(gmail, store);
      const r = await runLeadMail(d);
      expect(r.escalated).toBe(1);
      expect(r.drafted).toBe(0);
      expect(gmail.createDraft).not.toHaveBeenCalled();
      expect(notices[0]).toMatchObject({ kind: 'escalation' });
      expect(notices[0].approveUrl).toBeUndefined();
      expect(store.leadRows[0].next_step).toBe('Virat to reply personally');
    });
  }
  it('follows brain.decide: "ask Virat" means no draft even for a routine intent', async () => {
    const store = new MemoryLeadStore([lead()]);
    const gmail = mockGmail([raw({ id: 'x', thread: 'tx', from: 'asha@koraliving.in', subject: 'Hi', body: 'Keen to talk.' })]);
    const { d } = deps(gmail, store, { brain: { decide: async () => ({ verdict: 'ask Virat', reasons: ['test'], checks: [] }) } });
    expect((await runLeadMail(d)).escalated).toBe(1);
    expect(gmail.createDraft).not.toHaveBeenCalled();
  });
  it('autosend path exists but is off by default', async () => {
    const store = new MemoryLeadStore([lead()]);
    const gmail = mockGmail([raw({ id: 'y', thread: 'ty', from: 'asha@koraliving.in', subject: 'Hi', body: 'Keen to talk.' })]);
    await runLeadMail(deps(gmail, store).d);
    expect(gmail.sendDraft).not.toHaveBeenCalled();
  });
});

describe('approval token', () => {
  it('verifies a good signature and rejects a tampered one', () => {
    const { token } = signToken('msg-1', SECRET, NOW.getTime());
    expect(verifyToken(token, SECRET, NOW.getTime())).toMatchObject({ ok: true, payload: { m: 'msg-1' } });
    expect(verifyToken(token, 'other', NOW.getTime())).toEqual({ ok: false, reason: 'bad_signature' });
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), m: 'msg-2' })).toString('base64url');
    expect(verifyToken(`${forged}.${sig}`, SECRET, NOW.getTime()).ok).toBe(false);
    expect(verifyToken('garbage', SECRET).ok).toBe(false);
  });
  it('expires', () => {
    const { token } = signToken('msg-1', SECRET, NOW.getTime(), 1000);
    expect(verifyToken(token, SECRET, NOW.getTime() + 2000)).toEqual({ ok: false, reason: 'expired' });
  });
  it('is single use: sends the draft once and moves the lead on', async () => {
    const store = new MemoryLeadStore([lead({ stage: 'nda_sent' })]);
    const gmail = mockGmail([raw({ id: 'm1', thread: 't1', from: 'asha@koraliving.in', subject: 'NDA', body: 'Here it is.', attach: 'nda.pdf' })]);
    const { d, notices } = deps(gmail, store);
    await runLeadMail(d);
    const t = new URL(notices[0].approveUrl!).searchParams.get('t')!;
    const a = await approve({ store, gmail, secret: SECRET, now: NOW }, t);
    expect(a).toMatchObject({ ok: true, stage: 'nda_signed', nextStep: 'Book the intro call' });
    expect(gmail.sent).toEqual(['d1']);
    expect(store.msgs.find((m) => m.gmail_draft_id === 'd1')).toMatchObject({ status: 'sent', gmail_message_id: 'sent-d1' });
    expect(store.leadRows[0]).toMatchObject({ next_step: 'Book the intro call', next_step_due: '2026-09-30' });
    const again = await approve({ store, gmail, secret: SECRET, now: NOW }, t);
    expect(again.ok).toBe(false);
    expect(gmail.sent).toHaveLength(1);
  });
  it('releases the token when Gmail fails, so the link still works', async () => {
    const store = new MemoryLeadStore([lead()]);
    const gmail = mockGmail([raw({ id: 'm1', thread: 't1', from: 'asha@koraliving.in', subject: 'Hi', body: 'Keen to talk.' })]);
    const { d, notices } = deps(gmail, store);
    await runLeadMail(d);
    const t = new URL(notices[0].approveUrl!).searchParams.get('t')!;
    (gmail.sendDraft as any).mockRejectedValueOnce(new Error('503'));
    expect((await approve({ store, gmail, secret: SECRET, now: NOW }, t)).ok).toBe(false);
    expect((await approve({ store, gmail, secret: SECRET, now: NOW }, t)).ok).toBe(true);
  });
});

describe('voice', () => {
  it('flags "we", slop and emoji', () => {
    expect(voiceIssues('We would love to help.')).not.toEqual([]);
    expect(voiceIssues('Our team will call.')).not.toEqual([]);
    expect(voiceIssues("Great question! I'd be happy to help.")).not.toEqual([]);
    expect(voiceIssues('Thanks 🙏')).not.toEqual([]);
    expect(voiceIssues('Thanks, I will call you on Tuesday.')).toEqual([]);
  });
  it('every draft template passes the voice rules and says why it asks', () => {
    for (const intent of ['nda_signed', 'nda_pending', 'answers', 'published_terms', 'general'] as const) {
      const text = draftReply({ lead: lead({ stage: 'nda_signed' }), message: msg({ body: '1. We sell candles made by hand in Jaipur.\n2. Instagram is most of our sales today.' }), intent, now: NOW })!;
      expect(voiceIssues(text), `${intent}: ${text}`).toEqual([]);
      expect(text).not.toMatch(/\bwe\b/i);
      if (/\?/.test(text)) expect(text).toMatch(/(so |I'd like|I ask|which is why)/);
    }
    expect(draftReply({ lead: lead(), message: msg(), intent: 'high_stakes', now: NOW })).toBeNull();
  });
  it('approval notices carry the draft, both links, and no Google redirect links', () => {
    const n = { kind: 'approval' as const, leadName: 'Kora Living', subject: 'NDA', context: ['a', 'b'] as [string, string], draft: 'Hi Asha', approveUrl: 'https://viratmohan.com/api/leads/approve?t=x', gmailUrl: 'https://mail.google.com/mail/u/0/#all/t1' };
    const html = noticeEmailHtml(n), text = noticeText(n);
    expect(html).toContain('Approve &amp; send');
    expect(html).toContain('Edit in Gmail');
    expect(text).toContain('Approve & send: https://viratmohan.com/api/leads/approve?t=x');
    expect(html + text).not.toContain('google.com/url');
  });
});
