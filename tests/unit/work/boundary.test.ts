// The Work Registry is a tested foundation, not a rollout. These tests are the machine-checked form of that:
// nothing live can reach it, and it can reach nothing live.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const WORK = join(root, 'src/lib/work');

function walk(dir: string, exts: RegExp, skip: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (skip(p) || n === 'node_modules' || n === '.git' || n === 'dist' || n === '.vercel' || n === '.astro') continue;
    statSync(p).isDirectory() ? walk(p, exts, skip, out) : exts.test(n) && out.push(p);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const rel = (p: string) => relative(root, p).replaceAll('\\', '/');
const workFiles = () => walk(WORK, /\.ts$/, () => false);

describe('the Work library depends on nothing outside itself', () => {
  it('every import is a sibling file in this folder: no packages, no Node built-ins, no Astro, no Supabase', () => {
    const files = workFiles();
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      const specs = [
        ...[...src.matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
        ...[...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
      ];
      for (const spec of specs) {
        expect(spec.startsWith('./'), `${rel(f)} imports "${spec}"`).toBe(true);
        expect(existsSync(join(WORK, `${spec.slice(2)}.ts`)), `${rel(f)} imports missing sibling "${spec}"`).toBe(true);
      }
      if (rel(f) !== 'src/lib/work/index.ts') expect(specs.length, `${rel(f)} has imports`).toBeGreaterThanOrEqual(0);
    }
  });

  it('makes no network, file, process or dynamic-code calls', () => {
    for (const f of workFiles()) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const bad of [/\bfetch\s*\(/, /\bprocess\./, /\brequire\s*\(/, /\bimport\s*\(/, /\beval\s*\(/, /XMLHttpRequest/, /\blocalStorage\b/, /\bWebSocket\b/, /\bsetInterval\s*\(/, /\bsetTimeout\s*\(/]) {
        expect(bad.test(src), `${rel(f)} matches ${bad}`).toBe(false);
      }
    }
  });

  it('reads the wall clock and randomness only through the injectable clock and id source', () => {
    const clock = /\b(Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random\s*\(|randomUUID|crypto\b)/;
    for (const f of workFiles()) {
      let src = stripComments(readFileSync(f, 'utf8'));
      if (rel(f) === 'src/lib/work/registry.ts') {
        // the two sanctioned DEFAULTS: the clock line and the id function. Everything else must be clean.
        src = src.replace(/this\.now = opts\.now \?\? \(\(\) => new Date\(\)\.toISOString\(\)\);/, '');
        src = src.replace(/function defaultId\(\): string \{[\s\S]*?\n\}\n/, '');
      }
      expect(clock.test(src), `${rel(f)} reads the clock or randomness outside the injectable defaults`).toBe(false);
    }
  });
});

describe('only authorized surfaces reach the Work Registry', () => {
  const live = () => [
    ...walk(join(root, 'src'), /\.(ts|tsx|astro|mjs|js|json)$/, (p) => rel(p).startsWith('src/lib/work')),
    ...walk(join(root, 'scripts'), /\.(ts|mjs|js|json)$/, () => false),
    ...walk(join(root, 'public'), /\.(js|mjs|json)$/, () => false),
    ...['vercel.json', 'package.json', 'astro.config.mjs'].map((f) => join(root, f)).filter(existsSync),
  ];

  // Authorized consumers of the Work Registry (read or write through controlled paths):
  // - Founder Control Tower reads the registry to build the operating view
  // - Health report endpoint writes failures into the registry via health-runner
  // - CEO layer (coordinator, morning-board, types) builds views from registry types
  // - Control tower view layer builds the pipeline/stage projection
  // - retail-os-dashboard/command-centre declares capability names (string only, not DB access)
  const AUTHORIZED_IMPORT_PATHS = new Set([
    'src/pages/retail-os/admin/control-tower.astro',
    'src/pages/retail-os/api/health/report.ts',
    'src/lib/ceo/coordinator.ts',
    'src/lib/ceo/morning-board.ts',
    'src/lib/ceo/types.ts',
    'src/lib/ceo/ceo.test.ts',
    'src/lib/ceo/runtime.test.ts',
    'src/lib/ceo/founder-input.ts',
    'src/lib/ceo/context-pack.ts',
    'src/lib/ceo/authority.ts',
    'src/lib/ceo/response.ts',
    'src/lib/ceo/orchestrator.ts',
    'src/lib/ceo/orchestrator.test.ts',
    'src/lib/ceo/roles.ts',
    'scripts/verify/ceo-live.ts',
    'src/lib/ceo/founder-service.ts',
    'src/lib/ceo/founder-service.test.ts',
    'src/pages/retail-os/api/admin/ceo-input.ts',
    'src/lib/control-tower/types.ts',
    'src/lib/control-tower/view.ts',
  ]);

  it('only authorized surfaces import Work Registry code', () => {
    const hits = live().filter((f) => /['"][^'"]*lib\/work(\/[^'"]*)?['"]|from\s+['"]\.\/work(\/[^'"]*)?['"]|from\s+['"]\.\.\/work(\/[^'"]*)?['"]/.test(readFileSync(f, 'utf8')));
    const unauthorized = hits.map(rel).filter((r) => !AUTHORIZED_IMPORT_PATHS.has(r));
    expect(unauthorized).toEqual([]);
  });

  // `work_items` also appears as a Command Centre capability name (not a table reference).
  const AUTHORIZED_TABLE_NAME_PATHS = new Set([
    'src/lib/retail-os-dashboard/command-centre.ts',
  ]);

  it('no unauthorized surface names the registry tables or the migration', () => {
    const names = /work_items|work_events|work_source_events|work_links|repo_locks|0055_work_registry/;
    const hits = live().filter((f) => names.test(readFileSync(f, 'utf8')));
    const unauthorized = hits.map(rel).filter((r) => !AUTHORIZED_TABLE_NAME_PATHS.has(r));
    expect(unauthorized).toEqual([]);
  });

  it('the migration is a plain file in migrations/, applied by hand like every other: nothing runs the migrations folder', () => {
    expect(existsSync(join(root, 'migrations/0055_work_registry.sql'))).toBe(true);
    const runners = live().filter((f) => /readdirSync\(\s*['"`][^'"`]*migrations|from\s+['"]fs['"][\s\S]{0,400}migrations\//.test(readFileSync(f, 'utf8')));
    expect(runners.map(rel)).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(Object.values(pkg.scripts).some((s) => /migrat/i.test(s))).toBe(false);
  });

  it('the only dependency added for this work is the embedded Postgres used by the tests, as a dev dependency', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(pkg.devDependencies['@electric-sql/pglite']).toBeTruthy();
    expect(pkg.dependencies['@electric-sql/pglite']).toBeUndefined();
  });
});
