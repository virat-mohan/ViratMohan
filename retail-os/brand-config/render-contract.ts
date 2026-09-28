// Retail OS — render contract. Pure view-models proving ONE component renders
// different brands from config alone (common component + brand tokens = branded
// experience), without pulling in a UI framework. A Next.js/Astro shell consumes
// these models; the logic that decides "what shows" lives here and is testable.
import type { BrandConfig } from './types';
import { NAV_GROUPS } from './navigation';
import { MODULES, ALL_MODULE_KEYS } from './modules';
import { resolveModules } from './config';

export interface HeaderModel {
  brandName: string;
  logoPath?: string;
  expression: string;
  colors: { bg: string; ink: string; gold: string; secondary: string };
  fonts: { display: string; serif: string; sans: string };
}

export function buildHeaderModel(cfg: BrandConfig): HeaderModel {
  const t = cfg.identity.tokens;
  return {
    brandName: cfg.identity.name,
    logoPath: cfg.identity.logoPath,
    expression: t.expression,
    colors: { bg: t.bg, ink: t.ink, gold: t.gold, secondary: t.secondary },
    fonts: t.fonts,
  };
}

export interface NavItemModel { id: string; label: string; core: boolean; }

/**
 * Visible navigation for a brand: canonical groups filtered to those that are
 * core OR have at least one enabled module. Existing routes are never removed —
 * this only decides what the shell surfaces; per-brand label overrides apply.
 */
export function buildNavModel(cfg: BrandConfig): NavItemModel[] {
  const enabled = resolveModules(cfg);
  const groupsWithEnabledModule = new Set<string>();
  for (const k of ALL_MODULE_KEYS) {
    const def = MODULES[k];
    if (def.navGroup && enabled[k]) groupsWithEnabledModule.add(def.navGroup);
  }
  return NAV_GROUPS
    .filter((g) => g.core || groupsWithEnabledModule.has(g.id))
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ id: g.id, label: cfg.experience.navLabelOverrides?.[g.id] ?? g.label, core: g.core }));
}

/** Enabled modules grouped by their five-way classification (for a capability view). */
export function capabilitiesByClass(cfg: BrandConfig): Record<string, string[]> {
  const enabled = resolveModules(cfg);
  const out: Record<string, string[]> = { core: [], optional: [], 'client-extension': [], unknown: [] };
  for (const k of ALL_MODULE_KEYS) {
    if (enabled[k]) out[MODULES[k].classification].push(k);
  }
  return out;
}
