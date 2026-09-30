// Signed, unguessable links for a lead's access checklist and plan pages.
// token = base64url(lead id) "." base64url(HMAC-SHA256(secret, purpose:lead id))
// The purpose is part of the signature, so an access link can never open a plan and vice versa.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type TokenPurpose = 'access' | 'plan' | 'nda';
const MIN_SECRET = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const b64u = (b: Buffer) => b.toString('base64url');

function assertSecret(secret: string) {
  if (!secret || secret.length < MIN_SECRET) throw new Error('LEAD_TOKEN_SECRET must be set (32+ characters)');
}

function mac(secret: string, purpose: TokenPurpose, leadId: string) {
  return createHmac('sha256', secret).update(`${purpose}:${leadId.toLowerCase()}`).digest();
}

export function signLeadToken(leadId: string, purpose: TokenPurpose, secret: string): string {
  assertSecret(secret);
  if (!UUID.test(leadId)) throw new Error('lead id must be a uuid');
  return `${b64u(Buffer.from(leadId.toLowerCase()))}.${b64u(mac(secret, purpose, leadId))}`;
}

/** Returns the lead id when the token is genuine for this purpose, otherwise null. Constant-time compare. */
export function verifyLeadToken(token: string | undefined | null, purpose: TokenPurpose, secret: string): string | null {
  if (!secret || secret.length < MIN_SECRET || !token || token.length > 200) return null;
  const [idPart, sigPart, extra] = token.split('.');
  if (!idPart || !sigPart || extra !== undefined) return null;
  let leadId: string;
  let sig: Buffer;
  try {
    leadId = Buffer.from(idPart, 'base64url').toString('utf8');
    sig = Buffer.from(sigPart, 'base64url');
  } catch {
    return null;
  }
  if (!UUID.test(leadId)) return null;
  const expected = mac(secret, purpose, leadId);
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  // Reject non-canonical encodings of the same bytes.
  if (b64u(sig) !== sigPart || b64u(Buffer.from(leadId)) !== idPart) return null;
  return leadId;
}

// --- secrets at rest (e.g. a Shopify custom-app token the lead pastes) ---------------------------

function key(secret: string) {
  assertSecret(secret);
  return createHash('sha256').update(`lead-secret:${secret}`).digest();
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', b64u(iv), b64u(c.getAuthTag()), b64u(enc)].join('.');
}

export function decryptSecret(blob: string, secret: string): string {
  const [v, iv, tag, enc] = blob.split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('bad secret blob');
  const d = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}
