import { defineMiddleware } from 'astro:middleware';
import { isProtectedPath, checkAdminAuth } from './lib/admin-auth';

// P0 security fix: /devshop/admin/*, /devshop/api/track-update, and
// /devshop/api/frameworks had zero authentication — anyone with the URL
// could view every client's data, change pipeline stages, mark deposits
// paid, or edit the framework library. HTTP Basic Auth against a single
// shared secret is the minimum viable gate before real customer traffic;
// swap for real auth (magic link, SSO) when there's more than one admin.
// The decision logic itself lives in ./lib/admin-auth.ts, unit-tested there.
export const onRequest = defineMiddleware((context, next) => {
  if (!isProtectedPath(context.url.pathname)) return next();

  const auth = checkAdminAuth(context.request.headers.get('authorization'), process.env.ADMIN_PASSWORD);
  if (!auth.ok) {
    if (auth.status === 503) {
      return new Response('Admin access is not configured (ADMIN_PASSWORD unset).', { status: 503 });
    }
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Fast Tech Dev Shop admin"' },
    });
  }

  return next();
});
