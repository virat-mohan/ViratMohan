// Generate a standard Retail OS dashboard configuration for a new brand.
// Used when a brand completes onboarding — produces the canonical module set
// without requiring bespoke dashboard construction.
// Pure deterministic logic. No AI invocations.

import type { DashboardConfig } from './db-stores';
import { brandCeoFor } from './types';
import { PROVISIONING_COMPONENTS } from '../brand-node/provisioning';

export const CANONICAL_MODULES = [
  'command_centre',
  'brand',
  'catalogue',
  'commerce',
  'growth',
  'inventory_master',
  'finance',
  'operations',
  'team_partners',
  'reports',
  'settings',
] as const;

export type CanonicalModule = typeof CANONICAL_MODULES[number];

export type ModuleState = 'LIVE' | 'AVAILABLE' | 'SETUP_REQUIRED' | 'COMMERCIAL' | 'CLIENT_SPECIFIC' | 'COMING_SOON';

export interface BrandModuleManifest {
  enabled: CanonicalModule[];
  states: Record<string, ModuleState>;
  client_extensions: string[];
}

export function defaultModuleManifest(): BrandModuleManifest {
  const states: Record<string, ModuleState> = {};
  for (const m of CANONICAL_MODULES) {
    states[m] = m === 'command_centre' || m === 'brand' || m === 'settings'
      ? 'AVAILABLE'
      : 'SETUP_REQUIRED';
  }
  return {
    enabled: ['command_centre', 'brand', 'settings'],
    states,
    client_extensions: [],
  };
}

export function generateDashboardConfig(
  brandKey: string,
  opts: {
    enabled_modules?: CanonicalModule[];
    client_extensions?: string[];
  } = {},
): DashboardConfig {
  const manifest = defaultModuleManifest();
  const enabled = opts.enabled_modules ?? manifest.enabled;
  const states = { ...manifest.states };
  for (const m of enabled) states[m] = 'AVAILABLE';
  const ceo = brandCeoFor(brandKey);

  return {
    brand_key: brandKey,
    enabled_modules: [...enabled],
    module_states: states,
    brand_ceo_id: ceo?.id ?? null,
    config: {
      client_extensions: opts.client_extensions ?? [],
      provisioning_components: PROVISIONING_COMPONENTS.length,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function isReadyForDashboard(onboardingStage: string): boolean {
  const readyStages = ['AGREEMENT', 'DEPOSIT', 'ACCESS', 'FOUNDATION', 'SETUP', 'INTEGRATION', 'TESTING', 'LAUNCH', 'MONDAY_RESULT'];
  return readyStages.includes(onboardingStage);
}
