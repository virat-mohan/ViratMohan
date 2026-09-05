import { defineMiddleware } from 'astro:middleware';

// P0 security fix: /devshop/admin/*, /devshop/api/track-update, and
// /devshop/api/frameworks had zero authentication — anyone with the URL
// could view every client's data, change pipeline stages, mark deposits
// paid, or edit the framework library. HTTP Basic Auth against a single
// shared secret is the minimum viable gate before real customer traffic;
// swap for real auth (magic link, SSO) when there's more than one admin.
const PROTECTED_PREFIXES = ['/devshop/admin', '/devshop/api/track-update', '/devshop/api/frameworks'];

export const onRequest = defineMiddleware((context, next) => {
  const path = context.url.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
  if (!isProtected) return next();

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    // Fail closed, not open — an unset secret must never mean "no auth."
    return new Response('Admin access is not configured (ADMIN_PASSWORD unset).', { status: 503 });
  }

  const header = context.request.headers.get('authorization');
  const expected = 'Basic ' + btoa(`admin:${password}`);
  if (header !== expected) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Fast Tech Dev Shop admin"' },
    });
  }

  return next();
});
