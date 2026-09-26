import { describe, it, expect, vi } from 'vitest';
import { deliver, DAILY_CAP, nextQuotaSlot, OverQuotaError, type MailDeps, type QuotaStore } from '../../src/lib/mail/send';
import { buildMime, fromB64url, openToken, sealToken, type GmailApi } from '../../src/lib/mail/gmail';
import { cleanLinks, cleanTextLinks, cleanUrl, signatureHtml, signatureText } from '../../src/lib/mail/links';
import { renderRetailOsEmail } from '../../src/lib/retail-os-email';
import { viratRequestEmail } from '../../src/lib/retail-os-chat';
import { noticeEmailHtml } from '../../src/lib/lead-mail/notice';

const ME = 'viratmohan@gmail.com';
const NOW = new Date('2026-09-28T06:00:00Z');

function mockGmail() {
  const sent: string[] = [];
  const g: GmailApi = {
    listMessageIds: vi.fn(), getMessage: vi.fn(), createDraft: vi.fn(), sendDraft: vi.fn(), profile: vi.fn(),
    sendRaw: vi.fn(async (raw: string) => { sent.push(fromB64url(raw)); return { id: 'x', threadId: 'y' }; }),
  };
  return { g, sent };
}
class CountingQuota implements QuotaStore {
  used = 0;
  async reserve(_d: string, n: number, cap: number) { if (this.used + n > cap) return false; this.used += n; return true; }
}
const deps = (p: Partial<MailDeps>): MailDeps => ({ now: NOW, gmail: null, address: ME, quota: null, enqueue: null, resend: null, log: () => {}, ...p });

/** Decode every base64 MIME part so assertions see the real text and HTML. */
const decodeParts = (mime: string) => mime.split(/\r\n\r\n/).slice(1).map((b) => { const t = b.split('\r\n--')[0].replace(/\r\n/g, ''); return /^[A-Za-z0-9+/=]+$/.test(t) ? Buffer.from(t, 'base64').toString('utf8') : b; }).join('\n');

describe('Gmail sender', () => {
  it('sends as "Virat Mohan <viratmohan@gmail.com>" with text and HTML parts', async () => {
    const { g, sent } = mockGmail();
    const r = await deliver({ to: 'a@b.com', subject: 'Signed: Kora', html: '<p>Hello <b>there</b></p>' }, deps({ gmail: g }));
    expect(r).toBe('gmail');
    expect(sent[0]).toContain('From: Virat Mohan <viratmohan@gmail.com>');
    expect(sent[0]).toContain('multipart/alternative');
    expect(sent[0]).toContain('Content-Type: text/plain');
    expect(sent[0]).toContain('Content-Type: text/html');
    expect(decodeParts(sent[0])).toContain('Hello there');
  });
  it('falls back to Resend only when Gmail is not configured, and logs it', async () => {
    const resend = vi.fn(async () => {}); const log = vi.fn();
    expect(await deliver({ to: 'a@b.com', subject: 's', html: '<p>x</p>' }, deps({ resend, log }))).toBe('resend');
    expect(resend).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatch(/fell back to Resend/);
    const { g } = mockGmail();
    await deliver({ to: 'a@b.com', subject: 's', html: '<p>x</p>' }, deps({ gmail: g, resend }));
    expect(resend).toHaveBeenCalledOnce();
  });
  it(`queues anything past ${DAILY_CAP} a day for the next open slot`, async () => {
    const { g } = mockGmail(); const q = new CountingQuota(); q.used = DAILY_CAP - 1;
    const enqueue = vi.fn(async () => {});
    expect(await deliver({ to: 'a@b.com', subject: '1', html: 'x' }, deps({ gmail: g, quota: q, enqueue }))).toBe('gmail');
    expect(await deliver({ to: 'a@b.com', subject: '2', html: 'x' }, deps({ gmail: g, quota: q, enqueue }))).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ subject: '2' }), nextQuotaSlot(NOW));
    expect(g.sendRaw).toHaveBeenCalledTimes(1);
    await expect(deliver({ to: 'a@b.com', subject: '3', html: 'x' }, deps({ gmail: g, quota: q, enqueue }), { onOverQuota: 'throw' })).rejects.toBeInstanceOf(OverQuotaError);
  });
  it('next quota slot is 9am IST the next day (Monday after a Saturday)', () => {
    expect(nextQuotaSlot(new Date('2026-09-28T06:00:00Z')).toISOString()).toBe('2026-09-29T03:30:00.000Z');
    expect(nextQuotaSlot(new Date('2026-09-26T10:00:00Z')).toISOString()).toBe('2026-09-28T03:30:00.000Z');
  });
  it('builds a threaded reply', () => {
    const m = buildMime({ from: 'Virat Mohan <v@x.com>', to: 'a@b.com', subject: 'Re: Hi', text: 'ok', inReplyTo: '<1@x>', references: '<0@x>' });
    expect(m).toContain('In-Reply-To: <1@x>');
    expect(m).toContain('References: <0@x> <1@x>');
  });
  it('seals the refresh token so the database alone cannot read it', () => {
    const s = sealToken('1//refresh', 'key-1');
    expect(s).not.toContain('refresh');
    expect(openToken(s, 'key-1')).toBe('1//refresh');
    expect(() => openToken(s, 'key-2')).toThrow();
  });
});

describe('cleanLinks', () => {
  const real = 'https://viratmohan.com/retail-os';
  it('unwraps a Google wrapper with &amp; entities', () => {
    expect(cleanUrl('https://www.google.com/url?q=https://viratmohan.com/retail-os&amp;source=gmail&amp;ust=1727&amp;usg=AOv&amp;sa=E')).toBe(real);
  });
  it('unwraps a nested, percent-encoded q', () => {
    const inner = `https://www.google.com/url?q=${encodeURIComponent(real + '?a=1&b=2')}&sa=D`;
    expect(cleanUrl(`https://www.google.com/url?q=${encodeURIComponent(inner)}&source=gmail`)).toBe(real + '?a=1&b=2');
  });
  it('unwraps ?url= wrappers and forces https on an http target', () => {
    expect(cleanUrl('https://www.google.com/url?url=http://viratmohan.com/mission&sa=E')).toBe('https://viratmohan.com/mission');
    expect(cleanUrl('http://www.google.com/url?q=http%3A%2F%2Fviratmohan.com%2F&sa=E')).toBe('https://viratmohan.com/');
  });
  it('rewrites hrefs and turns bare URLs into readable anchors', () => {
    const out = cleanLinks('<p>See <a href="https://www.google.com/url?q=https://viratmohan.com/retail-os&amp;sa=E">here</a> or http://viratmohan.com/retail-os.</p>');
    expect(out).toContain('href="https://viratmohan.com/retail-os"');
    expect(out).toContain('>viratmohan.com/retail-os</a>.');
    expect(out).not.toContain('google.com/url');
  });
  it('cleans plain text', () => {
    expect(cleanTextLinks('Go to https://www.google.com/url?q=https://viratmohan.com/&sa=E now')).toBe('Go to https://viratmohan.com/ now');
  });
  it('signature is canonical and links straight to the site', () => {
    expect(signatureText(ME)).toContain('Virat Mohan · viratmohan.com · +91 99992 77240');
    expect(signatureHtml(ME)).toContain('href="https://viratmohan.com"');
    expect(signatureHtml(ME)).toContain(ME);
  });
});

describe('no template ever leaves with a google.com/url link', () => {
  const WRAPPED = 'https://www.google.com/url?q=https://viratmohan.com/retail-os&amp;source=gmail&amp;ust=1&amp;sa=E';
  const templates: [string, string][] = [
    ['retail-os email', renderRetailOsEmail({ preheader: 'p', heading: 'Hi', lines: [`See ${WRAPPED.replace(/&amp;/g, '&')}`], cta: { label: 'Open', url: WRAPPED.replace(/&amp;/g, '&') } })],
    ['approval notice', noticeEmailHtml({ kind: 'approval', leadName: 'K', subject: 's', context: ['a', 'b'], draft: `Hi ${WRAPPED}`, approveUrl: 'https://viratmohan.com/api/leads/approve?t=x', gmailUrl: 'https://mail.google.com/mail/u/0/#all/t' })],
    ['chat escalation', viratRequestEmail({ reason: `Look at ${WRAPPED}`, contact: 'a@b.com', name: 'A' }, null, 's1').html],
    ['raw html with wrapped href', `<p><a href="${WRAPPED}">site</a></p>`],
  ];
  for (const [name, html] of templates) {
    it(name, async () => {
      const { g, sent } = mockGmail();
      await deliver({ to: 'a@b.com', subject: name, html }, deps({ gmail: g }));
      const body = decodeParts(sent[0]);
      expect(body).not.toContain('google.com/url');
    });
  }
});
