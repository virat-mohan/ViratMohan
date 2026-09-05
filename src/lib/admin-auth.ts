// Pure decision logic behind the admin Basic Auth gate (src/middleware.ts).
// Split out so it can be unit-tested without the astro:middleware runtime.
export const PROTECTED_PREFIXES = [
  '/devshop/admin',
  '/devshop/api/track-update',
  '/devshop/api/frameworks',
  '/devshop/api/amc-rates',
  '/devshop/api/amc-proposal',
  '/devshop/api/amc-decision',
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export type AdminAuthResult = { ok: true } | { ok: false; status: 401 | 503 };

// Fails closed: an unset password must never be treated as "no auth required."
export function checkAdminAuth(authorizationHeader: string | null, password: string | undefined): AdminAuthResult {
  if (!password) return { ok: false, status: 503 };
  const expected = 'Basic ' + btoa(`admin:${password}`);
  if (authorizationHeader !== expected) return { ok: false, status: 401 };
  return { ok: true };
}
