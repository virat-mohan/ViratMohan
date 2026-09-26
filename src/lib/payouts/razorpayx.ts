// RazorpayX payouts adapter. Only the brand's fund-account id (fa_...) is ever
// sent; bank details live with RazorpayX, never in our database.
//   createPayout   POST /v1/payouts with X-Payout-Idempotency, so a retried
//                  cron run can never pay the same brand-week twice
//   verifyWebhook  X-Razorpay-Signature = hex HMAC-SHA256(raw body, webhook secret)
//   parseWebhook   payout.* events → { payoutId, status, utr, referenceId }
import { createHmac, timingSafeEqual } from 'node:crypto';

export type RazorpayXConfig = {
  keyId: string;
  keySecret: string;
  accountNumber: string; // the RazorpayX business account payouts are debited from
  mode?: 'IMPS' | 'NEFT' | 'RTGS' | 'UPI';
};

export type PayoutRequest = {
  fundAccountId: string;
  amountPaise: number;
  idempotencyKey: string;
  referenceId: string; // our settlement id
  narration: string; // shown on the brand's bank statement
};

export type PayoutStatus = 'queued' | 'pending' | 'processing' | 'processed' | 'reversed' | 'cancelled' | 'rejected' | 'failed';

export type PayoutResult = { id: string; status: PayoutStatus; utr: string | null; raw: unknown };

export function narration(text: string): string {
  // RazorpayX: alphanumerics and spaces, max 30 characters.
  return text.replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
}

export async function createPayout(cfg: RazorpayXConfig, req: PayoutRequest, fetchImpl: typeof fetch = fetch): Promise<PayoutResult> {
  if (!Number.isInteger(req.amountPaise) || req.amountPaise <= 0) throw new Error('Payout amount must be a positive whole number of paise');
  const res = await fetchImpl('https://api.razorpay.com/v1/payouts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Basic ' + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64'),
      'X-Payout-Idempotency': req.idempotencyKey,
    },
    body: JSON.stringify({
      account_number: cfg.accountNumber,
      fund_account_id: req.fundAccountId,
      amount: req.amountPaise,
      currency: 'INR',
      mode: cfg.mode ?? 'IMPS',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: req.referenceId.slice(0, 40),
      narration: narration(req.narration),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`RazorpayX ${res.status}: ${body?.error?.description ?? 'payout failed'}`);
  return { id: String(body.id), status: body.status as PayoutStatus, utr: body.utr ?? null, raw: body };
}

export function verifyWebhook(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PayoutWebhook = { event: string; payoutId: string; status: PayoutStatus; utr: string | null; referenceId: string | null; failureReason: string | null };

export function parseWebhook(body: any): PayoutWebhook | null {
  const p = body?.payload?.payout?.entity;
  if (!p?.id || typeof body?.event !== 'string' || !body.event.startsWith('payout.')) return null;
  return {
    event: body.event, payoutId: String(p.id), status: p.status as PayoutStatus, utr: p.utr ?? null,
    referenceId: p.reference_id ?? null, failureReason: p.status_details?.description ?? p.failure_reason ?? null,
  };
}
