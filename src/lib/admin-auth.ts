// Pure decision logic behind the admin Basic Auth gate (src/middleware.ts).
// Split out so it can be unit-tested without the astro:middleware runtime.
import { timingSafeEqual } from 'node:crypto';

// Constant-time string compare. Different lengths short-circuit (length is not
// secret here), equal lengths are compared without an early-exit byte scan.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const PROTECTED_PREFIXES = [
  '/devshop/admin',
  '/devshop/api/track-update',
  '/devshop/api/frameworks',
  '/devshop/api/amc-rates',
  '/devshop/api/amc-proposal',
  '/devshop/api/amc-decision',
  '/devshop/api/review-action',
  '/devshop/api/ai-agents',
  '/devshop/api/delete-submission',
  '/devshop/api/usecase-templates',
  '/devshop/api/approve',
  '/devshop/api/delivery',
  '/devshop/api/economics',
  '/retail-os/admin',
  '/retail-os/api/admin',
  '/api/admin',
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export type AdminAuthResult = { ok: true } | { ok: false; status: 401 | 503 };

// Fails closed: an unset password must never be treated as "no auth required."
export function checkAdminAuth(authorizationHeader: string | null, password: string | undefined): AdminAuthResult {
  if (!password) return { ok: false, status: 503 };
  const expected = 'Basic ' + btoa(`admin:${password}`);
  if (!authorizationHeader || !safeEqual(authorizationHeader, expected)) return { ok: false, status: 401 };
  return { ok: true };
}
