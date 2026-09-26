// Approve & send links: signed (HMAC-SHA256), expiring, and single-use.
// The signature proves the link came from the system; the nonce row in
// lead_approval_tokens makes it work once.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOKEN_TTL_MS = 72 * 3600_000;
export type TokenPayload = { m: string; n: string; exp: number }; // lead_messages id, nonce, expiry (ms)

const enc = (s: string) => Buffer.from(s).toString('base64url');
const sig = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('base64url');

export function signToken(messageId: string, secret: string, now = Date.now(), ttl = TOKEN_TTL_MS): { token: string; payload: TokenPayload } {
  if (!secret) throw new Error('LEAD_APPROVAL_SECRET is not set');
  const payload: TokenPayload = { m: messageId, n: randomBytes(16).toString('base64url'), exp: now + ttl };
  const body = enc(JSON.stringify(payload));
  return { token: `${body}.${sig(body, secret)}`, payload };
}

export type VerifyResult = { ok: true; payload: TokenPayload } | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

/** Signature and expiry only. Single use is enforced by the store's consume(). */
export function verifyToken(token: string, secret: string, now = Date.now()): VerifyResult {
  if (!secret) return { ok: false, reason: 'bad_signature' };
  const [body, s] = (token ?? '').split('.');
  if (!body || !s) return { ok: false, reason: 'malformed' };
  const want = Buffer.from(sig(body, secret)), got = Buffer.from(s);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'bad_signature' };
  let p: TokenPayload;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
  if (!p?.m || !p?.n || typeof p.exp !== 'number') return { ok: false, reason: 'malformed' };
  if (now > p.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload: p };
}
