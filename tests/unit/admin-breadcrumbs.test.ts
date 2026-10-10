import { describe, expect, it } from 'vitest';
import { adminBreadcrumbs } from '../../src/lib/admin-breadcrumbs';

const labels = (p: string, o = {}) => adminBreadcrumbs(p, o).map((c) => c.label);
const hrefs = (p: string, o = {}) => adminBreadcrumbs(p, o).map((c) => c.href);

describe('admin breadcrumbs', () => {
  it('every page starts at the Command Centre and ends on the current page without a link', () => {
    for (const p of ['/retail-os/admin', '/retail-os/admin/control-tower', '/retail-os/admin/org', '/retail-os/admin/leads', '/retail-os/admin/brands', '/retail-os/admin/reports', '/retail-os/admin/faq', '/retail-os/admin/invoices', '/retail-os/admin/inbox', '/retail-os/admin/publish']) {
      const t = adminBreadcrumbs(p);
      expect(t[0].label, p).toBe('Command Centre');
      expect(t[t.length - 1].href, p).toBeNull();
      expect(t.slice(0, -1).every((c) => c.href), p).toBe(true);
    }
  });

  it('the Command Centre itself is the root, and its tabs hang off it', () => {
    expect(labels('/retail-os/admin/console')).toEqual(['Command Centre']);
    expect(labels('/retail-os/admin/console', { tab: 'today' })).toEqual(['Command Centre']);
    expect(labels('/retail-os/admin/console', { tab: 'live' })).toEqual(['Command Centre', 'Live brands']);
    expect(hrefs('/retail-os/admin/console', { tab: 'crm' })).toEqual(['/retail-os/admin/console', null]);
  });

  it('Control Tower: Command Centre > Control Tower > tab, and the founder trail Work Pipeline works', () => {
    expect(labels('/retail-os/admin/control-tower')).toEqual(['Command Centre', 'Control Tower']);
    expect(labels('/retail-os/admin/control-tower', { tab: 'pipeline' })).toEqual(['Command Centre', 'Control Tower', 'Work Pipeline']);
    expect(labels('/retail-os/admin/control-tower', { tab: 'agents' })).toEqual(['Command Centre', 'Control Tower', 'Agents']);
    expect(hrefs('/retail-os/admin/control-tower', { tab: 'ceo' })).toEqual(['/retail-os/admin/console', '/retail-os/admin/control-tower', null]);
  });

  it('an unknown tab falls back to the default and never appears in the trail', () => {
    expect(labels('/retail-os/admin/control-tower', { tab: '<script>x</script>' })).toEqual(['Command Centre', 'Control Tower']);
    expect(labels('/retail-os/admin/org', { tab: 'nope' })).toEqual(['Command Centre', 'Org board']);
  });

  it('org tabs', () => {
    expect(labels('/retail-os/admin/org', { tab: 'rights' })).toEqual(['Command Centre', 'Org board', 'Decision rights']);
  });

  it('plan and design pages use the real brand name, and never show the record id', () => {
    const id = '3b9f0c1e-aaaa-bbbb-cccc-1234567890ab';
    expect(labels(`/retail-os/admin/plan/${id}`, { resource: 'Korbi' })).toEqual(['Command Centre', 'Applications', 'Korbi', 'Business plan']);
    expect(labels(`/retail-os/admin/design/${id}`, { resource: 'Korbi' })).toEqual(['Command Centre', 'Applications', 'Korbi', 'Design direction']);
    expect(JSON.stringify(adminBreadcrumbs(`/retail-os/admin/plan/${id}`, { resource: 'Korbi' }))).not.toContain(id);
  });

  it('a record that was not found leaks nothing: no resource crumb and no id', () => {
    const id = 'secret-id-123';
    const t = adminBreadcrumbs(`/retail-os/admin/plan/${id}`, { resource: null });
    expect(t.map((c) => c.label)).toEqual(['Command Centre', 'Applications', 'Business plan']);
    expect(JSON.stringify(t)).not.toContain(id);
    expect(labels(`/retail-os/admin/media/unknown-key`, { resource: null })).toEqual(['Command Centre', 'Brands', 'Media assets']);
  });

  it('media: Command Centre > Brands > brand > Media assets, with the Brands crumb linked', () => {
    expect(labels('/retail-os/admin/media/korbi', { resource: 'Korbi' })).toEqual(['Command Centre', 'Brands', 'Korbi', 'Media assets']);
    expect(adminBreadcrumbs('/retail-os/admin/media/korbi', { resource: 'Korbi' })[1].href).toBe('/retail-os/admin/brands');
  });

  it('a long resource name is cut, and trailing slashes are ignored', () => {
    const t = adminBreadcrumbs('/retail-os/admin/plan/x/', { resource: 'A'.repeat(200) });
    expect(t[2].label.length).toBeLessThanOrEqual(60);
    expect(labels('/retail-os/admin/leads/')).toEqual(['Command Centre', 'Leads']);
  });

  it('an unknown admin path still gets a safe trail', () => {
    expect(labels('/retail-os/admin/something-new')).toEqual(['Command Centre', 'something new']);
  });
});
