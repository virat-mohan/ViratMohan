import { describe, it, expect, vi } from 'vitest';
import { canMove, forward, health, pipeline, stageAfterSent, goLiveTarget, daysToLive, JOURNEY } from '../../src/lib/lead-journey';
import { ndaText, ndaHash, ndaRequestDraft, ndaSections } from '../../src/lib/lead-nda';
import { voiceIssues } from '../../src/lib/lead-mail/core';
import { MemoryLeadStore } from '../../src/lib/lead-mail/store';
import { approve } from '../../src/lib/lead-mail/run';
import { signToken } from '../../src/lib/lead-mail/token';
import { BRAND_SETUP_TASKS, brandKey } from '../../src/lib/ops-seed';
import type { GmailApi } from '../../src/lib/mail/gmail';

const NOW = new Date('2026-09-28T06:00:00Z');

describe('journey', () => {
  it('only moves forward, except out to lost or paused and back in', () => {
    expect(canMove('new', 'nda_sent')).toBe(true);
    expect(canMove('nda_sent', 'new')).toBe(false);
    expect(canMove('applied', 'lost')).toBe(true);
    expect(canMove('paused', 'nda_signed')).toBe(true);
    expect(forward('signed', 'applied')).toBe('signed');
    expect(forward('won', 'live')).toBe('won'); // legacy alias, no move
  });
  it('maps a sent draft to the stage that follows', () => {
    expect(stageAfterSent('nda_request', 'new')).toBe('nda_sent');
    expect(stageAfterSent('nda_reminder', 'nda_sent')).toBe('nda_sent');
    expect(stageAfterSent('access_request', 'nda_signed')).toBe('access_requested');
    expect(stageAfterSent('plan_cover', 'plan_ready')).toBe('plan_sent');
    expect(stageAfterSent('plan_cover', 'discovery')).toBe('discovery'); // never backwards
  });
  it('flags a stage that has slipped and names who holds it', () => {
    const h = health({ stage: 'nda_sent', stage_changed_at: '2026-09-20T00:00:00Z' }, NOW);
    expect(h.late).toBe(true); expect(h.daysIn).toBe(8); expect(h.owner).toBe('The founder');
    expect(health({ stage: 'nda_sent', stage_changed_at: NOW.toISOString() }, NOW).late).toBe(false);
  });
  it('7-day clock: target is 7 days from data connected; stages after it fit inside 7 days', () => {
    const lead = { stage: 'plan_sent', clock_started_at: '2026-09-28T06:00:00Z' };
    expect(goLiveTarget(lead)?.toISOString()).toBe('2026-10-05T06:00:00.000Z');
    expect(daysToLive(lead, new Date('2026-10-01T06:00:00Z'))).toBe(4);
    expect(daysToLive({ stage: 'live', clock_started_at: lead.clock_started_at })).toBeNull();
    const after = JOURNEY.slice(JOURNEY.findIndex((s) => s.stage === 'data_connected'), JOURNEY.findIndex((s) => s.stage === 'live'));
    expect(after.reduce((n, s) => n + s.slaDays, 0)).toBeLessThanOrEqual(7);
  });
  it('counts the pipeline in journey order', () => {
    const p = pipeline([{ stage: 'new' }, { stage: 'contacted' }, { stage: 'won' }, { stage: 'nda_sent' }]);
    expect(p.find((x) => x.stage === 'new')?.count).toBe(2);
    expect(p.find((x) => x.stage === 'live')?.count).toBe(1);
    expect(p.map((x) => x.stage)).not.toContain('contacted');
  });
});

describe('NDA', () => {
  const brand = { name: 'Kora Living LLP', address: '12 MG Road, Bengaluru 560001', represented: 'Asha Rao' };
  it('is mutual, names both parties and hashes stably', () => {
    const text = ndaText(brand, '28 September 2026');
    expect(text).toContain('Virat Mohan, trading as DevShop Retail OS');
    expect(text).toContain('Kora Living LLP');
    expect(text).toMatch(/Non-compete and non-circumvention/);
    expect(ndaHash(text)).toBe(ndaHash(ndaText(brand, '28 September 2026')));
    expect(ndaHash(text)).not.toBe(ndaHash(ndaText({ ...brand, name: 'Other' }, '28 September 2026')));
    expect(ndaSections(brand, 'x').map((s) => s.heading)[0]).toBe('Parties');
  });
  it('request email passes the voice check and carries the link', () => {
    const d = ndaRequestDraft({ brand_name: 'Kora Living', contact_name: 'Asha Rao' }, 'https://viratmohan.com/retail-os/nda/abc.def', NOW);
    expect(d.body).toContain('Hi Asha,');
    expect(d.body).toContain('https://viratmohan.com/retail-os/nda/abc.def');
    expect(voiceIssues(d.body)).toEqual([]);
    expect(d.purpose).toBe('nda_request');
  });
});

describe('approve sends a parked journey email', () => {
  it('sends fresh from Gmail, marks it sent and moves the lead to nda_sent', async () => {
    const store = new MemoryLeadStore([{ id: '00000000-0000-4000-8000-000000000001', brand_name: 'Kora Living', contact_name: 'Asha', contact_email: 'asha@kora.in', stage: 'new', next_step: null, next_step_due: null }]);
    const row = (await store.insertMessage({ lead_id: '00000000-0000-4000-8000-000000000001', direction: 'outbound', channel: 'email', status: 'awaiting_approval', subject: 'NDA first', body: 'Hi Asha,\n\nSign here: https://viratmohan.com/retail-os/nda/x.y\n\nVirat', gmail_message_id: null, gmail_thread_id: null }))!;
    (row as any).purpose = 'nda_request';
    const { token, payload } = signToken(row.id, 'secret', NOW.getTime());
    await store.saveToken(payload.n, row.id, new Date(payload.exp));
    const gmail = { sendRaw: vi.fn(async () => ({ id: 'g9', threadId: 't9' })), sendDraft: vi.fn(async () => { throw new Error('no draft'); }) } as unknown as GmailApi;
    const r = await approve({ store, gmail, secret: 'secret', now: NOW, mailbox: 'viratmohan@gmail.com' }, token);
    expect(r).toMatchObject({ ok: true, stage: 'nda_sent' });
    expect(gmail.sendRaw).toHaveBeenCalledTimes(1);
    const raw = Buffer.from((gmail.sendRaw as any).mock.calls[0][0], 'base64url').toString();
    expect(raw).toContain('To: asha@kora.in');
    expect(raw).not.toContain('google.com/url');
    expect(store.msgs[0].status).toBe('sent');
    expect(store.leadRows[0].stage).toBe('nda_sent');
    expect((store.leadRows[0] as any).nda_sent_at).toBe(NOW.toISOString());
  });
});

describe('ops seed', () => {
  it('covers every KRA stage, in order, with a why, inside 7 days', () => {
    const stages = [...new Set(BRAND_SETUP_TASKS.map((t) => t.stage_label))];
    expect(stages).toEqual(['Prerequisites', 'Foundations', 'Payments', 'Shipping', 'Email', 'WhatsApp', 'Instagram', 'Ads', 'Admin', 'Handover']);
    expect(BRAND_SETUP_TASKS.every((t) => t.note.startsWith('Why:'))).toBe(true);
    expect(Math.max(...BRAND_SETUP_TASKS.map((t) => t.day))).toBeLessThanOrEqual(7);
    expect(brandKey('Iredus Aloo Chips')).toBe('iredusaloochips');
  });
});
