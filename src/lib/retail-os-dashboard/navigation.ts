// Canonical dashboard navigation: resolve a brand's enabled modules into a nav tree.
// Pure — no framework, no network. Consumed by the brand plane's shell component.

import {
  DASHBOARD_SECTIONS, SECTION_LABELS, SECTION_PATHS,
  type DashboardConfig, type DashboardModule, type DashboardSection, type ModuleState,
} from './types';

export interface NavGroup {
  section: DashboardSection;
  label: string;
  path: string;
  items: NavItem[];
  visible: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  path: string;
  state: ModuleState;
  badge?: string;
}

/**
 * Build the canonical nav tree from a dashboard config. Sections with no live/available modules
 * are hidden (visible: false) but still present in the structure, so the architecture is stable
 * even when a brand has few modules enabled.
 */
export function buildNavigation(config: DashboardConfig): NavGroup[] {
  const bySection = new Map<DashboardSection, DashboardModule[]>();
  for (const m of config.modules) {
    const list = bySection.get(m.section) ?? [];
    list.push(m);
    bySection.set(m.section, list);
  }

  return DASHBOARD_SECTIONS.map((section): NavGroup => {
    const items = (bySection.get(section) ?? []).map((m): NavItem => ({
      id: m.id,
      label: m.label,
      path: m.path,
      state: m.state,
    }));
    const hasActiveModules = items.some((i) => i.state === 'live' || i.state === 'available' || i.state === 'setup_required');
    // Command Centre is always visible
    const visible = section === 'command_centre' || hasActiveModules;
    return {
      section,
      label: SECTION_LABELS[section],
      path: SECTION_PATHS[section],
      items,
      visible,
    };
  });
}

/** Filter to only visible sections. */
export function visibleNavigation(config: DashboardConfig): NavGroup[] {
  return buildNavigation(config).filter((g) => g.visible);
}
