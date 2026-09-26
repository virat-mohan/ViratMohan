import { describe, it, expect, vi } from 'vitest';
import { questionIn, replyText } from '../../src/lib/knowledge-loop';
import { MemoryLeadStore } from '../../src/lib/lead-mail/store';
import { runLeadMail, type RunDeps } from '../../src/lib/lead-mail/run';
import { decide } from '../../src/lib/brain/decide';
import type { GmailApi, GmailRawMessage } from '../../src/lib/mail/gmail';
import type { Lead } from '../../src/lib/lead-mail/core';

const ME = 'viratmohan@gmail.com';
const NOW = new Date('2026-09-28T06:00:00Z');
const b64 = (s: string) => Buffer.from(s).toString('base64url');

function raw(p: { id: string; thread: string; from: string; to?: string; subject: string; body: string; at?: number }): GmailRawMessage {
  const headers = [{ name: 'From', value: p.from }, { name: 'To', value: p.to ?? ME }, { name: 'Subject', value: p.subject }, { name: 'Message-ID', value: `<${p.id}@mail>` }];
  return { id: p.id, threadId: p.thread, labelIds: ['INBOX'], internalDate: String(p.at ?? NOW.getTime()), payload: { mimeType: 'multipart/mixed', headers, parts: [{ mimeType: 'text/plain', body: { data: b64(p.body) } }] } };
}
function gmail(msgs: GmailRawMessage[]): GmailApi {
  return {
    listMessageIds: vi.fn(async () => msgs.map((m) => ({ id: m.id, threadId: m.threadId })).reverse()),
    getMessage: vi.fn(async (id: string) => msgs.find((m) => m.id === id)!),
    createDraft: vi.fn(async () => ({ id: 'd1', messageId: 'dm1' })),
    sendDraft: vi.fn(async () => ({ id: 'sent', threadId: 't' })),
    sendRaw: vi.fn(async () => { throw new Error('no'); }),
    profile: vi.fn(async () => ({ emailAddress: ME, historyId: '1' })),
  };
}
const lead: Lead = { id: 'lead-1', brand_name: 'Kora Living', contact_name: 'Asha Rao', contact_email: 'asha@koraliving.in', stage: 'contacted', next_step: null, next_step_due: null };

describe('questionIn / replyText', () => {
  it('finds the first real question and drops quoted mail', () => {
    expect(questionIn('Hi Virat,\n\nDo you also handle Amazon listings for the brand?\nThanks\n\nOn Mon, X wrote:\n> what is your price?')).toBe('Do you also handle Amazon listings for the brand?');
    expect(questionIn('ok?')).toBeNull();
    expect(questionIn('Keen to talk. No questions.')).toBeNull();
  });
  it('keeps only the new text of a reply', () => {
    const body = 'Yes, I list on Amazon too. It comes under marketplaces in the plan.\n\nBest,\nVirat\n\nOn Mon, Asha wrote:\n> Do you also handle Amazon?';
    expect(replyText(body)).toBe('Yes, I list on Amazon too. It comes under marketplaces in the plan.');
  });
});

describe('the email assistant feeds the shared inbox', () => {
  function deps(g: GmailApi, store: MemoryLeadStore, extra: Partial<RunDeps> = {}): RunDeps & { asked: unknown[]; answered: unknown[] } {
    const asked: unknown[] = [], answered: unknown[] = [];
    return {
      gmail: g, store, mailbox: ME, now: NOW, baseUrl: 'https://viratmohan.com', approvalSecret: 's', autosend: false,
      brain: { decide: async (s) => decide(s), answer: async () => ({ answer: "I don't know that yet.", known: false }) },
      notifyVirat: async () => {},
      knowledge: { noteUnanswered: async (...a) => { asked.push(a); }, noteAnswered: async (...a) => { answered.push(a); } },
      asked, answered, ...extra,
    };
  }

  it('logs a question the Brain could not answer, tagged with the lead and thread', async () => {
    const store = new MemoryLeadStore([{ ...lead }]);
    const d = deps(gmail([raw({ id: 'm1', thread: 't1', from: 'Asha <asha@koraliving.in>', subject: 'Question', body: 'Hi Virat,\n\nDo you also handle Amazon listings for the brand?\nAsha' })]), store);
    await runLeadMail(d);
    expect(d.asked).toEqual([['Do you also handle Amazon listings for the brand?', 'email', { source: 'email:t1', leadId: 'lead-1' }]]);
    expect(d.answered).toEqual([]);
  });

  it("keeps Virat's own reply with the question so it can be published in one step", async () => {
    const store = new MemoryLeadStore([{ ...lead }]);
    const msgs = [
      raw({ id: 'm1', thread: 't1', from: 'Asha <asha@koraliving.in>', subject: 'Question', body: 'Do you also handle Amazon listings for the brand?', at: NOW.getTime() - 3_600_000 }),
      raw({ id: 'm2', thread: 't1', from: `Virat Mohan <${ME}>`, to: 'asha@koraliving.in', subject: 'Re: Question', body: 'Yes, I list on Amazon too. It comes under marketplaces in the plan.\n\nVirat\n\nOn Mon, Asha wrote:\n> Do you also handle Amazon listings?' }),
    ];
    const d = deps(gmail(msgs), store);
    await runLeadMail(d);
    expect(d.answered).toHaveLength(1);
    const [q, a, ctx] = d.answered[0] as [string, string, Record<string, string>];
    expect(q).toBe('Do you also handle Amazon listings for the brand?');
    expect(a).toContain('Yes, I list on Amazon too.');
    expect(ctx).toEqual({ source: 'email:t1', leadId: 'lead-1', answerSource: 'email:m2' });
  });

  it('runs fine without the knowledge loop wired', async () => {
    const store = new MemoryLeadStore([{ ...lead }]);
    const d = deps(gmail([raw({ id: 'm1', thread: 't1', from: 'Asha <asha@koraliving.in>', subject: 'Q', body: 'Do you also handle Amazon listings for the brand?' })]), store, { knowledge: undefined });
    const r = await runLeadMail(d);
    expect(r.errors).toEqual([]);
    expect(r.logged).toBe(1);
  });
});
