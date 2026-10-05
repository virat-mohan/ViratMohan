// Tests proving the synthetic brand → dashboard contract works correctly.
// These run against the package contracts, not the Next.js runtime.

import { describe, expect, it } from 'vitest';
import { defineBrand } from '@retail-os/brand-config/brand-config';
import { resolveModuleStatus } from '@retail-os/brand-config/module-status';
import {
  DASHBOARD_SECTIONS,
  buildDashboardSections,
  visibleDashboardSections,
} from '@retail-os/brand-config/dashboard-sections';
import { buildHeaderModel } from '@retail-os/brand-config/render-contract';
import { brandConfigInput, identity } from './brand';
import { COMMAND_CENTRE_CAPABILITIES, resolveCommandCentre } from './command-centre';

const config = defineBrand(brandConfigInput);
const probe = { hasSetting: () => false };

describe('starter dashboard contract', () => {
  it('produces 11 sections from the synthetic brand', () => {
    const statuses = resolveModuleStatus(config, probe);
    const sections = buildDashboardSections(config, statuses);
    expect(sections).toHaveLength(11);
    expect(sections.map((s) => s.section)).toEqual([...DASHBOARD_SECTIONS]);
  });

  it('Command Centre and Brand are always visible', () => {
    const statuses = resolveModuleStatus(config, probe);
    const sections = buildDashboardSections(config, statuses);
    expect(sections.find((s) => s.section === 'command_centre')!.visible).toBe(true);
    expect(sections.find((s) => s.section === 'brand')!.visible).toBe(true);
  });

  it('sections with core modules are visible', () => {
    const statuses = resolveModuleStatus(config, probe);
    const sections = buildDashboardSections(config, statuses);
    expect(sections.find((s) => s.section === 'commerce')!.visible).toBe(true);
    expect(sections.find((s) => s.section === 'catalogue')!.visible).toBe(true);
    expect(sections.find((s) => s.section === 'inventory_master')!.visible).toBe(true);
  });

  it('visible sections are a subset of all sections', () => {
    const statuses = resolveModuleStatus(config, probe);
    const visible = visibleDashboardSections(config, statuses);
    expect(visible.length).toBeLessThanOrEqual(11);
    expect(visible.every((s) => s.visible)).toBe(true);
  });

  it('header model reflects the synthetic brand', () => {
    const header = buildHeaderModel(config);
    expect(header.brandName).toBe('Starter Brand');
    expect(header.expression).toBe('paper');
  });

  it('Command Centre has 13 capability slots', () => {
    const slots = resolveCommandCentre(new Set());
    expect(slots).toHaveLength(13);
    expect(slots.every((s) => s.state === 'coming_soon')).toBe(true);
  });

  it('retention is a first-class capability', () => {
    expect(COMMAND_CENTRE_CAPABILITIES).toContain('retention');
    const slots = resolveCommandCentre(new Set());
    expect(slots.find((s) => s.capability === 'retention')!.label).toBe('Repeat Customer Rate');
  });

  it('section ordering is canonical', () => {
    const statuses = resolveModuleStatus(config, probe);
    const sections = buildDashboardSections(config, statuses);
    const order = sections.map((s) => s.section);
    expect(order[0]).toBe('command_centre');
    expect(order[5]).toBe('inventory_master');
    expect(order[10]).toBe('settings');
  });

  it('module states are correct (core modules live when setup satisfied)', () => {
    const allSetup = { hasSetting: () => true };
    const statuses = resolveModuleStatus(config, allSetup);
    const sections = buildDashboardSections(config, statuses);
    const commerce = sections.find((s) => s.section === 'commerce')!;
    expect(commerce.items.some((i) => i.state === 'live')).toBe(true);
  });
});
