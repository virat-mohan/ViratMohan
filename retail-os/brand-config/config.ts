// Retail OS — defineBrand() (merge over CORE) + validateBrandConfig() + module resolution.
import type { BrandConfig, BrandConfigInput, BrandTokens } from './types';
import { CORE_DEFAULTS, PAPER_TOKENS } from './defaults';
import { MODULES, ALL_MODULE_KEYS, isModuleKey, type ModuleKey } from './modules';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Merge a brand author's partial config over the CORE defaults. Pure, no I/O. */
export function defineBrand(input: BrandConfigInput): BrandConfig {
  const tokens: BrandTokens = { ...PAPER_TOKENS, ...(input.identity.tokens ?? {}), fonts: { ...PAPER_TOKENS.fonts, ...(input.identity.tokens?.fonts ?? {}) } };
  return {
    identity: { ...input.identity, tokens },
    commerce: { ...CORE_DEFAULTS.commerce, ...(input.commerce ?? {}), checkout: { ...CORE_DEFAULTS.commerce.checkout, ...(input.commerce?.checkout ?? {}) } },
    integrations: { ...CORE_DEFAULTS.integrations, ...(input.integrations ?? {}) },
    experience: { ...CORE_DEFAULTS.experience, ...(input.experience ?? {}) },
    modules: { ...CORE_DEFAULTS.modules, ...(input.modules ?? {}) },
    hasClientExtensions: input.hasClientExtensions ?? CORE_DEFAULTS.hasClientExtensions,
  };
}

export interface ValidationResult { ok: boolean; errors: string[]; warnings: string[]; }

/** Validate a resolved config. Errors block; warnings (e.g. missing module deps) inform. */
export function validateBrandConfig(cfg: BrandConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!cfg.identity?.key?.trim()) errors.push('identity.key is required');
  if (!cfg.identity?.name?.trim()) errors.push('identity.name is required');

  const t = cfg.identity?.tokens;
  if (!t) errors.push('identity.tokens is required');
  else {
    for (const c of ['bg', 'ink', 'gold', 'secondary'] as const) {
      if (!HEX.test(t[c] ?? '')) errors.push(`identity.tokens.${c} must be a #rrggbb hex (got "${t[c]}")`);
    }
    if (!['paper', 'devshop-dark', 'client'].includes(t.expression)) errors.push(`identity.tokens.expression invalid: "${t.expression}"`);
  }

  if (!cfg.commerce?.currency?.trim()) errors.push('commerce.currency is required');
  if (!cfg.commerce?.currencySymbol?.trim()) errors.push('commerce.currencySymbol is required');

  // Unknown module keys in overrides are a hard error (typo protection).
  for (const k of Object.keys(cfg.modules ?? {})) {
    if (!isModuleKey(k)) errors.push(`unknown module key in overrides: "${k}"`);
  }

  // Core modules must never be disabled.
  for (const k of ALL_MODULE_KEYS) {
    if (MODULES[k].classification === 'core' && cfg.modules[k] === false) {
      errors.push(`core module "${k}" cannot be disabled`);
    }
  }

  // A client-extension enabled on a brand not marked hasClientExtensions is a warning.
  for (const k of ALL_MODULE_KEYS) {
    if (cfg.modules[k] && MODULES[k].classification === 'client-extension' && !cfg.hasClientExtensions) {
      warnings.push(`client-extension "${k}" enabled but hasClientExtensions is false`);
    }
  }

  // Module dependency check.
  for (const k of ALL_MODULE_KEYS) {
    if (!cfg.modules[k]) continue;
    for (const dep of MODULES[k].requires ?? []) {
      if (!cfg.modules[dep]) warnings.push(`module "${k}" requires "${dep}", which is not enabled`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Resolved enabled/disabled map (defaults + overrides), typed by module key. */
export function resolveModules(cfg: BrandConfig): Record<ModuleKey, boolean> {
  const out = {} as Record<ModuleKey, boolean>;
  for (const k of ALL_MODULE_KEYS) out[k] = cfg.modules[k] ?? MODULES[k].defaultEnabled;
  return out;
}

export function isModuleEnabled(cfg: BrandConfig, key: ModuleKey): boolean {
  return cfg.modules[key] ?? MODULES[key].defaultEnabled;
}
