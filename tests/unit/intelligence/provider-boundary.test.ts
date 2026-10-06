// Architectural safeguard: the invocation gate is the only way to reach the Anthropic API.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const PROVIDER = 'src/lib/intelligence/provider.ts';

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx|astro|mjs|js)$/.test(n) && out.push(p);
  }
  return out;
}
const rel = (f: string) => relative(root, f).replaceAll('\\', '/');
const src = () => walk(join(root, 'src'));

describe('provider boundary', () => {
  it('only the governed provider calls the Anthropic API', () => {
    const hits = src().filter((f) => /api\.anthropic\.com/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual([PROVIDER]);
  });

  it('no call site picks its own model: no claude-* model id literal outside the intelligence library', () => {
    const hits = src()
      .filter((f) => !rel(f).startsWith('src/lib/intelligence/'))
      .filter((f) => /['"`]claude-(haiku|sonnet|opus|fable)-[\w.-]+['"`]/.test(readFileSync(f, 'utf8')))
      .map(rel);
    expect(hits).toEqual([]);
  });

  it('no file outside the provider builds an Anthropic request (x-api-key / anthropic-version headers)', () => {
    const hits = src().filter((f) => rel(f) !== PROVIDER && /anthropic-version|x-api-key/i.test(readFileSync(f, 'utf8'))).map(rel);
    expect(hits).toEqual([]);
  });

  it('every other intelligence file is pure: no network calls', () => {
    for (const f of walk(join(root, 'src/lib/intelligence')).filter((x) => rel(x) !== PROVIDER)) {
      expect(/\bfetch\s*\(|api\.anthropic\.com/.test(readFileSync(f, 'utf8')), rel(f)).toBe(false);
    }
  });
});
