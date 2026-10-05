// Canonical Retail OS brand dashboard: types and structure.
// Pure contract — no framework, no network, no brand-specific data.

export const DASHBOARD_SECTIONS = [
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
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

export const MODULE_STATES = ['live', 'available', 'setup_required', 'commercial', 'client_specific', 'coming_soon'] as const;
export type ModuleState = (typeof MODULE_STATES)[number];

export interface DashboardModule {
  id: string;
  section: DashboardSection;
  label: string;
  path: string;
  state: ModuleState;
  description?: string;
  ownerBrand?: string; // set only for client_specific modules
}

export interface DashboardConfig {
  brandKey: string;
  brandName: string;
  sections: DashboardSection[];
  modules: DashboardModule[];
}

export const SECTION_LABELS: Record<DashboardSection, string> = {
  command_centre: 'Command Centre',
  brand: 'Brand',
  catalogue: 'Catalogue',
  commerce: 'Commerce',
  growth: 'Growth',
  inventory_master: 'Inventory Master',
  finance: 'Finance',
  operations: 'Operations',
  team_partners: 'Team & Partners',
  reports: 'Reports',
  settings: 'Settings',
};

export const SECTION_PATHS: Record<DashboardSection, string> = {
  command_centre: '/admin',
  brand: '/admin/brand',
  catalogue: '/admin/catalogue',
  commerce: '/admin/commerce',
  growth: '/admin/growth',
  inventory_master: '/admin/inventory',
  finance: '/admin/finance',
  operations: '/admin/operations',
  team_partners: '/admin/team',
  reports: '/admin/reports',
  settings: '/admin/settings',
};
