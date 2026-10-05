// Retail OS — canonical navigation groups.
//
// These are the conceptual groups every brand's admin/dashboard organises under.
// They are a BASELINE, not a ceiling: a brand may surface extra pages. Existing
// routes are never removed; a page that doesn't fit a group is classified, not
// deleted. "Inventory Master" and "Catalogue / Products" are deliberately kept
// as DISTINCT groups (canonical terminology — do not merge, do not rename).

export interface NavGroup {
  id: string;
  label: string;
  /** Always visible regardless of enabled modules (the core spine). */
  core: boolean;
  order: number;
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'dashboard', label: 'Dashboard', core: true, order: 0 },
  { id: 'commerce', label: 'Commerce', core: true, order: 10 },
  { id: 'orders', label: 'Orders', core: true, order: 20 },
  { id: 'products', label: 'Catalogue / Products', core: true, order: 30 },
  { id: 'inventory-master', label: 'Inventory Master', core: true, order: 40 },
  { id: 'customers', label: 'Customers', core: true, order: 50 },
  { id: 'marketing', label: 'Marketing', core: true, order: 60 },
  { id: 'crm', label: 'CRM / Leads', core: false, order: 70 },
  { id: 'analytics', label: 'Analytics', core: true, order: 80 },
  { id: 'growth', label: 'Growth', core: false, order: 90 },
  { id: 'finance', label: 'Finance', core: true, order: 100 },
  { id: 'operations', label: 'Operations', core: false, order: 110 },
  { id: 'reporting', label: 'Reporting', core: true, order: 120 },
  { id: 'ai-brain', label: 'AI / Brain', core: false, order: 130 },
  { id: 'tasks', label: 'Tasks / Approvals', core: false, order: 140 },
  { id: 'integrations', label: 'Integrations', core: true, order: 150 },
  { id: 'settings', label: 'Settings', core: true, order: 160 },
];

export const NAV_GROUP_IDS = NAV_GROUPS.map((g) => g.id);

export function isNavGroupId(id: string): boolean {
  return NAV_GROUP_IDS.includes(id);
}
