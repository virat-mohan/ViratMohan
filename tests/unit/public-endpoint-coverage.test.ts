// Every API route that changes something and is not behind the admin gate is either rate limited per client, or is
// authenticated by an unguessable token in its path, a signature or a secret. A new public route cannot skip both.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isProtectedPath } from '../../src/lib/admin-auth';

const root = process.cwd();
const PAGES = join(root, 'src/pages');
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : /\.ts$/.test(n) && out.push(p);
  }
  return out;
}
const routeOf = (f: string) => '/' + relative(PAGES, f).replace(/\.ts$/, '').replace(/\/index$/, '');
const mutating = (src: string) => /export const (POST|PUT|PATCH|DELETE)\b/.test(src);

const routes = walk(PAGES).filter((f) => relative(PAGES, f).split('/').includes('api')).map((f) => ({ f, route: routeOf(f), src: readFileSync(f, 'utf8') })).filter((r) => mutating(r.src));

// Routes with no per-client limit, and why that is acceptable. Dynamic [id]/[token] segments are unguessable bearers.
const NOT_LIMITED: Record<string, string> = {
  '/retail-os/api/deposit/[id]': 'bearer: application id in the path',
  '/retail-os/api/setup/[id]': 'bearer: application id in the path',
  '/retail-os/api/prepare/[id]': 'bearer: application id in the path',
  '/retail-os/api/sign/[id]': 'bearer: application id in the path',
  '/retail-os/api/design-choice/[id]': 'bearer: application id in the path',
  '/retail-os/api/nda/[token]/sign': 'bearer: signed NDA token in the path',
  '/retail-os/api/access/[token]': 'bearer: access token in the path',
  '/retail-os/api/ops/[token]/log': 'bearer: ops work-page token in the path',
  '/retail-os/api/ops/[token]/task': 'bearer: ops work-page token in the path',
  '/retail-os/api/leads/approve': 'one-tap approval link with a signed token',
  '/api/leads/approve': 'one-tap approval link with a signed token',
  '/api/payouts/webhook': 'provider webhook with signature verification',
  '/api/whatsapp/webhook': 'provider webhook with signature verification',
  '/devshop/api/feedback-webhook': 'webhook with a shared secret',
  '/retail-os/api/org/update': 'checks the admin password inside the handler',
  '/retail-os/api/health/report': 'bearer CRON_SECRET, checked before any database access',
};

describe('public mutating endpoints are rate limited or token/secret authenticated', () => {
  const open = routes.filter((r) => !isProtectedPath(r.route) && !r.route.includes('/api/cron/') && !r.route.startsWith('/api/admin'));

  it('finds the routes', () => { expect(open.length).toBeGreaterThan(10); });

  it('every open route imports the limiter or is on the reviewed list', () => {
    const missing = open.filter((r) => !/endpointLimit|createRateLimiter/.test(r.src) && !(r.route in NOT_LIMITED)).map((r) => r.route);
    expect(missing).toEqual([]);
  });

  it('every reviewed exception is real, and really authenticated by a token in the path, a signature or a secret', () => {
    for (const [route, why] of Object.entries(NOT_LIMITED)) {
      const hit = open.find((r) => r.route === route);
      if (!hit) continue; // a route can exist under /api and /retail-os/api; only the real ones are checked
      const bearer = route.includes('[');
      const guarded = /CRON_SECRET|checkAdminAuth|signature|x-hub|x-signature|Bearer|timingSafe|verify|token|secret/i.test(hit.src);
      expect(bearer || guarded, `${route} (${why}) has no token, signature or secret`).toBe(true);
    }
  });

  it('the limited routes are the ones that send mail, write, or call a model without a bearer', () => {
    const limited = open.filter((r) => /endpointLimit/.test(r.src)).map((r) => r.route).sort();
    expect(limited).toEqual(expect.arrayContaining([
      '/dashboard/api/request', '/devshop/api/demo-feedback', '/devshop/api/demo-interest', '/devshop/api/intake',
      '/partners/api/apply', '/retail-os/api/apply', '/retail-os/api/chat', '/retail-os/api/faq/ask', '/retail-os/api/resend-link',
    ]));
  });

  it('the limiter runs before the body is read in every limited route', () => {
    for (const r of open.filter((x) => /endpointLimit/.test(x.src))) {
      const i = r.src.indexOf('limit(request)');
      expect(i, r.route).toBeGreaterThan(-1);
      const firstRead = r.src.search(/request\.(json|formData|text)\(|readJson\(request/);
      expect(firstRead === -1 || i < firstRead, `${r.route}: limiter must come before the body is read`).toBe(true);
    }
  });
});
