import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_SECTIONS, SECTION_LABELS, SECTION_PATHS, MODULE_STATES,
  buildNavigation, visibleNavigation, resolveCommandCentre,
  COMMAND_CENTRE_CAPABILITIES,
  type DashboardConfig, type DashboardModule,
} from '../../../src/lib/retail-os-dashboard';

const mod = (id: string, section: DashboardConfig['sections'][number], state: DashboardModule['state'], label?: string): DashboardModule => ({
  id, section, label: label ?? id, path: `/admin/${id}`, state,
});

const minConfig: DashboardConfig = {
  brandKey: 'test',
  brandName: 'Test Brand',
  sections: [...DASHBOARD_SECTIONS],
  modules: [
    mod('overview', 'command_centre', 'live', 'Overview'),
    mod('orders', 'commerce', 'live', 'Orders'),
    mod('products', 'catalogue', 'live', 'Products'),
    mod('pnl', 'finance', 'coming_soon', 'P&L'),
  ],
};

describe('dashboard types', () => {
  it('has 11 canonical sections in the correct order', () => {
    expect(DASHBOARD_SECTIONS).toHaveLength(11);
    expect(DASHBOARD_SECTIONS[0]).toBe('command_centre');
    expect(DASHBOARD_SECTIONS[5]).toBe('inventory_master');
    expect(DASHBOARD_SECTIONS[10]).toBe('settings');
  });

  it('every section has a label and path', () => {
    for (const s of DASHBOARD_SECTIONS) {
      expect(SECTION_LABELS[s]).toBeTruthy();
      expect(SECTION_PATHS[s]).toBeTruthy();
    }
  });

  it('Inventory Master is the canonical name', () => {
    expect(SECTION_LABELS.inventory_master).toBe('Inventory Master');
  });

  it('has 6 module states', () => {
    expect(MODULE_STATES).toEqual(['live', 'available', 'setup_required', 'commercial', 'client_specific', 'coming_soon']);
  });
});

describe('navigation', () => {
  it('builds all 11 sections regardless of module count', () => {
    const nav = buildNavigation(minConfig);
    expect(nav).toHaveLength(11);
    expect(nav.map((g) => g.section)).toEqual([...DASHBOARD_SECTIONS]);
  });

  it('Command Centre is always visible even with no modules', () => {
    const empty: DashboardConfig = { brandKey: 'x', brandName: 'X', sections: [...DASHBOARD_SECTIONS], modules: [] };
    const nav = buildNavigation(empty);
    const cc = nav.find((g) => g.section === 'command_centre')!;
    expect(cc.visible).toBe(true);
  });

  it('sections with no live/available modules are hidden', () => {
    const nav = buildNavigation(minConfig);
    const settings = nav.find((g) => g.section === 'settings')!;
    expect(settings.visible).toBe(false);
  });

  it('sections with coming_soon-only modules are hidden', () => {
    const nav = buildNavigation(minConfig);
    const finance = nav.find((g) => g.section === 'finance')!;
    expect(finance.visible).toBe(false);
  });

  it('sections with live modules are visible', () => {
    const nav = buildNavigation(minConfig);
    const commerce = nav.find((g) => g.section === 'commerce')!;
    expect(commerce.visible).toBe(true);
    expect(commerce.items).toHaveLength(1);
    expect(commerce.items[0].label).toBe('Orders');
  });

  it('visibleNavigation filters out hidden sections', () => {
    const vis = visibleNavigation(minConfig);
    expect(vis.length).toBeLessThan(11);
    expect(vis.every((g) => g.visible)).toBe(true);
    expect(vis.map((g) => g.section)).toContain('command_centre');
    expect(vis.map((g) => g.section)).toContain('commerce');
    expect(vis.map((g) => g.section)).not.toContain('settings');
  });

  it('setup_required modules make their section visible', () => {
    const config: DashboardConfig = {
      brandKey: 'x', brandName: 'X', sections: [...DASHBOARD_SECTIONS],
      modules: [mod('integrations', 'settings', 'setup_required')],
    };
    const nav = buildNavigation(config);
    expect(nav.find((g) => g.section === 'settings')!.visible).toBe(true);
  });
});

describe('command centre', () => {
  it('returns all 13 capability slots', () => {
    const slots = resolveCommandCentre(new Set());
    expect(slots).toHaveLength(13);
  });

  it('capabilities with data are live, others are coming_soon', () => {
    const live = new Set<(typeof COMMAND_CENTRE_CAPABILITIES)[number]>(['revenue', 'orders']);
    const slots = resolveCommandCentre(live);
    expect(slots.find((s) => s.capability === 'revenue')!.state).toBe('live');
    expect(slots.find((s) => s.capability === 'orders')!.state).toBe('live');
    expect(slots.find((s) => s.capability === 'retention')!.state).toBe('coming_soon');
  });

  it('includes retention as a first-class capability', () => {
    const slots = resolveCommandCentre(new Set());
    const retention = slots.find((s) => s.capability === 'retention');
    expect(retention).toBeDefined();
    expect(retention!.label).toBe('Repeat Customer Rate');
  });
});
