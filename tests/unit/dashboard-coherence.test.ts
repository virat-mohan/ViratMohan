// One platform: every viratmohan.com admin page carries the platform line, a breadcrumb, the shared tokens and the
// phone rules. A new admin page that skips any of them fails here.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { adminBreadcrumbs, isKnownAdminPath } from '../../src/lib/admin-breadcrumbs';

const root = process.cwd();
const ADMIN_DIR = join(root, 'src/pages/retail-os/admin');
function pages(dir = ADMIN_DIR, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? pages(p, out) : n.endsWith('.astro') && out.push(p);
  }
  return out;
}
const files = pages();
const routeOf = (f: string) => {
  const r = relative(ADMIN_DIR, f).replace(/\.astro$/, '').replace(/\[(\w+)\]/g, 'x');
  return r === 'index' ? '/retail-os/admin' : `/retail-os/admin/${r}`;
};

describe('every admin page is part of the one platform', () => {
  it('finds the admin pages', () => { expect(files.length).toBeGreaterThanOrEqual(14); });

  for (const f of files) {
    const name = relative(root, f);
    it(`${name}: platform line, breadcrumb, tokens, viewport`, () => {
      const s = readFileSync(f, 'utf8');
      expect(s, 'vm-band').toContain('class="vm-band"');
      expect(s, 'tokens').toContain('/brand/tokens.css');
      expect(s, 'viewport').toMatch(/name="viewport"/);
      expect(s, 'AdminBreadcrumbs').toContain('<AdminBreadcrumbs');
      expect(s.indexOf('class="vm-band"'), 'band comes before the breadcrumb').toBeLessThan(s.indexOf('<AdminBreadcrumbs'));
      expect(isKnownAdminPath(routeOf(f)), `breadcrumb definition for ${routeOf(f)}`).toBe(true);
    });
  }

  it('every page except the Control Tower (which sizes its own controls) links the phone stylesheet, and it exists', () => {
    expect(existsSync(join(root, 'public/retail-os/admin-touch.css'))).toBe(true);
    for (const f of files.filter((x) => !x.endsWith('control-tower.astro'))) expect(readFileSync(f, 'utf8'), relative(root, f)).toContain('/retail-os/admin-touch.css');
  });

  it('the Control Tower keeps its 44px breadcrumb/tab rule through the shared component', () => {
    const c = readFileSync(join(root, 'src/components/AdminBreadcrumbs.astro'), 'utf8');
    expect(c).toMatch(/min-height:\s*44px/);
  });

  it('there is exactly one breadcrumb implementation in the admin pages', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), relative(root, f)).not.toMatch(/class="breadcrumbs"/);
  });

  it('the signature line is defined once, in the shared token file, and pages do not redefine its colours', () => {
    const tokens = readFileSync(join(root, 'public/brand/tokens.css'), 'utf8');
    expect(tokens).toContain('.vm-band');
    for (const f of files) expect(readFileSync(f, 'utf8'), relative(root, f)).not.toMatch(/\.vm-band\s*\{/);
  });
});

describe('breadcrumbs follow the real route', () => {
  it('a Control Tower tab trail names the tab the founder is on', () => {
    expect(adminBreadcrumbs('/retail-os/admin/control-tower', { tab: 'pipeline' }).map((c) => c.label)).toEqual(['Command Centre', 'Control Tower', 'Work Pipeline']);
  });
});
