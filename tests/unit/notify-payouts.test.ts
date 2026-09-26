import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { isOpenHours, nextOpenSlot, notify, viratFrom, type NotifyDeps } from '../../src/lib/notify';
import { createPayout, narration, parseWebhook, verifyWebhook } from '../../src/lib/payouts/razorpayx';
import { gateFromEnv } from '../../src/lib/settle-run';

const ist = (s: string) => new Date(s + '+05:30');

describe('quiet hours', () => {
  it('open 9am–8pm IST Monday–Saturday', () => {
    expect(isOpenHours(ist('2026-09-28T09:00:00'))).toBe(true); // Mon
    expect(isOpenHours(ist('2026-09-28T19:59:00'))).toBe(true);
    expect(isOpenHours(ist('2026-09-28T20:00:00'))).toBe(false);
    expect(isOpenHours(ist('2026-09-28T08:59:00'))).toBe(false);
    expect(isOpenHours(ist('2026-09-27T12:00:00'))).toBe(false); // Sun
  });
  it('next slot', () => {
    expect(nextOpenSlot(ist('2026-09-28T21:00:00')).toISOString()).toBe(ist('2026-09-29T09:00:00').toISOString());
    expect(nextOpenSlot(ist('2026-09-29T06:00:00')).toISOString()).toBe(ist('2026-09-29T09:00:00').toISOString());
    expect(nextOpenSlot(ist('2026-09-26T22:00:00')).toISOString()).toBe(ist('2026-09-28T09:00:00').toISOString()); // Sat night → Mon
    expect(nextOpenSlot(ist('2026-09-27T10:00:00')).toISOString()).toBe(ist('2026-09-28T09:00:00').toISOString()); // Sun → Mon
  });
  it('queues outside hours, except an immediate reply to a team member', async () => {
    const log: string[] = [];
    const deps = (now: Date): NotifyDeps => ({ now, sendEmail: async () => { log.push('email'); }, sendWhatsApp: async () => { log.push('wa'); }, enqueue: async (_m, at) => { log.push('queued ' + at.toISOString()); } });
    const late = ist('2026-09-28T22:00:00');
    expect(await notify({ channel: 'whatsapp', to: '91', text: 'x' }, deps(late))).toBe('queued');
    expect(await notify({ channel: 'whatsapp', to: '91', text: 'x' }, deps(late), { replyToInbound: true })).toBe('sent');
    expect(await notify({ channel: 'email', to: 'a@b', subject: 's', html: 'h' }, deps(late), { replyToInbound: true })).toBe('queued');
    expect(await notify({ channel: 'email', to: 'a@b', subject: 's', html: 'h' }, deps(ist('2026-09-28T12:00:00')))).toBe('sent');
  });
  it('always sends as Virat', () => {
    expect(viratFrom('DevShop Bot <hello@viratmohan.com>')).toBe('Virat Mohan <hello@viratmohan.com>');
    expect(viratFrom('hello@viratmohan.com')).toBe('Virat Mohan <hello@viratmohan.com>');
  });
});

describe('RazorpayX', () => {
  it('verifies webhook signatures', () => {
    const body = '{"event":"payout.processed"}';
    const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(verifyWebhook(body, sig, 'whsec')).toBe(true);
    expect(verifyWebhook(body, sig, 'nope')).toBe(false);
    expect(verifyWebhook(body, null, 'whsec')).toBe(false);
  });
  it('parses payout events', () => {
    expect(parseWebhook({ event: 'payout.processed', payload: { payout: { entity: { id: 'pout_1', status: 'processed', utr: 'UTR1', reference_id: 's1' } } } }))
      .toMatchObject({ payoutId: 'pout_1', status: 'processed', utr: 'UTR1' });
    expect(parseWebhook({ event: 'payment.captured' })).toBeNull();
  });
  it('sends the idempotency key and only a fund-account id', async () => {
    let req: any;
    const fake = (async (_u: string, init: any) => { req = init; return new Response(JSON.stringify({ id: 'pout_1', status: 'processing', utr: null }), { status: 200 }); }) as typeof fetch;
    const r = await createPayout({ keyId: 'k', keySecret: 's', accountNumber: '232323' }, { fundAccountId: 'fa_1', amountPaise: 42000, idempotencyKey: 'settle_x', referenceId: 'sid', narration: 'DevShop Moonglasses 2026-09-21' }, fake);
    expect(r.id).toBe('pout_1');
    expect(req.headers['X-Payout-Idempotency']).toBe('settle_x');
    expect(JSON.parse(req.body)).toMatchObject({ fund_account_id: 'fa_1', amount: 42000, currency: 'INR' });
    expect(narration('DevShop: Moonglasses — 2026-09-21!')).toBe('DevShop Moonglasses 2026 09 21');
    await expect(createPayout({ keyId: 'k', keySecret: 's', accountNumber: '1' }, { fundAccountId: 'fa', amountPaise: 0, idempotencyKey: 'k', referenceId: 'r', narration: 'n' }, fake)).rejects.toThrow();
  });
  it('payouts default to dry run; caps come from env in rupees', () => {
    expect(gateFromEnv({ PAYOUTS_ENABLED: '', PAYOUT_CAP_PER_PAYOUT_INR: '', PAYOUT_CAP_WEEKLY_INR: '' })).toEqual({ enabled: false, perPayoutCapPaise: null, weeklyCapPaise: null });
    expect(gateFromEnv({ PAYOUTS_ENABLED: 'true', PAYOUT_CAP_PER_PAYOUT_INR: '50000', PAYOUT_CAP_WEEKLY_INR: '200000' })).toEqual({ enabled: true, perPayoutCapPaise: 5_000_000, weeklyCapPaise: 20_000_000 });
  });
});
