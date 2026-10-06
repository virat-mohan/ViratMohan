// Pins every file that calls the Anthropic API directly. These call sites predate the Intelligence Governor and
// choose their own model. No new one may appear; migrating each to gateInvocation is a deferred, per-brand change.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const KNOWN_DIRECT_CALLERS = new Set([
  'src/lib/brain/claude.ts',
  'src/lib/ingest/whatsapp.ts',
  'src/lib/llm.ts',
  'src/lib/retail-os-business-plan.ts',
  'src/lib/retail-os-design-direction.ts',
  'src/lib/retail-os-faq.ts',
  'src/lib/retail-os-prepare.ts',
  'src/pages/retail-os/api/chat.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx|astro|mjs|js)$/.test(n) && out.push(p);
  }
  return out;
}

describe('provider boundary', () => {
  it('no new file calls the Anthropic API directly', () => {
    const hits = walk(join(root, 'src'))
      .filter((f) => /api\.anthropic\.com/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f).replaceAll('\\', '/'));
    expect(hits.filter((h) => !KNOWN_DIRECT_CALLERS.has(h))).toEqual([]);
  });

  it('the intelligence library itself makes no network calls', () => {
    for (const f of walk(join(root, 'src/lib/intelligence'))) {
      const src = readFileSync(f, 'utf8');
      expect(/\bfetch\s*\(|api\.anthropic\.com/.test(src), f).toBe(false);
    }
  });
});
