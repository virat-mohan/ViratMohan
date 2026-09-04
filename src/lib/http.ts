// On Vercel, request.url inside a serverless function is often an internal
// URL (e.g. localhost) rather than the public one — the real host/proto
// live in forwarded headers. Prefer those; fall back to request.url's own
// origin for local `astro dev`, where those headers aren't set.
export function getOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
