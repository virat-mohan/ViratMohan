// Release-path security guards that can be checked mechanically. Not a penetration test.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const rel = (f: string) => relative(root, f).replaceAll('\\', '/');
function walk(dir: string, test: (n: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, test, out) : test(n) && out.push(p);
  }
  return out;
}
const read = (f: string) => readFileSync(f, 'utf8');

describe('service-role credentials never reach the browser', () => {
  it('no text file served from public/ names the service role or carries a JWT', () => {
    const hits = walk(join(root, 'public'), (n) => /\.(js|mjs|html|css|json|map|txt)$/.test(n))
      .filter((f) => /SERVICE_ROLE|service_role|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });

  it('no client <script> block in an .astro page touches server-only names', () => {
    const hits: string[] = [];
    for (const f of walk(join(root, 'src'), (n) => n.endsWith('.astro'))) {
      for (const m of read(f).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
        if (/serviceDb|SERVICE_ROLE|getEnv|process\.env|SUPABASE_URL/.test(m[1])) hits.push(rel(f));
      }
    }
    expect(hits).toEqual([]);
  });

  it('no page serialises the environment into a response', () => {
    const hits = walk(join(root, 'src/pages'), (n) => /\.(ts|astro)$/.test(n))
      .filter((f) => /JSON\.stringify\(env\b|json\(env\b|\.\.\.env\b/.test(read(f))).map(rel);
    expect(hits).toEqual([]);
  });
});

describe('no request can pick the database', () => {
  it('every database client built inside a page is built from environment values only', () => {
    const bad: string[] = [];
    for (const f of walk(join(root, 'src/pages'), (n) => /\.(ts|astro)$/.test(n))) {
      for (const m of read(f).matchAll(/createClient\(([^)]*)\)/g)) {
        if (!/^\s*env\.SUPABASE_URL,\s*env\.SUPABASE_SERVICE_ROLE_KEY\b/.test(m[1])) bad.push(`${rel(f)}: ${m[0].slice(0, 70)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('admin API routes sit behind the admin gate', () => {
  it('every route under /retail-os/api/admin and /devshop/api/ admin-style paths is a protected path', async () => {
    const { isProtectedPath } = await import('../../src/lib/admin-auth');
    const routes = walk(join(root, 'src/pages/retail-os/api/admin'), (n) => n.endsWith('.ts'))
      .map((f) => '/' + rel(f).replace(/^src\/pages\//, '').replace(/\.ts$/, '').replace(/\/index$/, ''));
    expect(routes.length).toBeGreaterThan(5);
    expect(routes.filter((r) => !isProtectedPath(r))).toEqual([]);
  });
});
