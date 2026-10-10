// Command Centre capability slots.
// The canonical 13 capabilities from the dashboard standard.
// Where a capability is not yet connected, it shows as coming_soon.

export const COMMAND_CENTRE_CAPABILITIES = [
  'revenue',
  'orders',
  'customers',
  'retention',
  'inventory',
  'finance',
  'growth',
  'marketing',
  'operations',
  'approvals',
  'alerts',
  'opportunities',
  'health',
] as const;

export type CommandCentreCapability = (typeof COMMAND_CENTRE_CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<CommandCentreCapability, string> = {
  revenue: 'Revenue',
  orders: 'Orders',
  customers: 'Customers',
  retention: 'Repeat Customer Rate',
  inventory: 'Inventory Exceptions',
  finance: 'Finance Exceptions',
  growth: 'Growth Indicators',
  marketing: 'Marketing',
  operations: 'Operational Issues',
  approvals: 'Approvals',
  alerts: 'Alerts',
  opportunities: 'Opportunities',
  health: 'Business Health',
};

export interface CommandCentreSlot {
  capability: CommandCentreCapability;
  label: string;
  state: 'live' | 'coming_soon';
}

export function resolveCommandCentre(
  liveCapabilities: Set<CommandCentreCapability>,
): CommandCentreSlot[] {
  return COMMAND_CENTRE_CAPABILITIES.map((cap) => ({
    capability: cap,
    label: CAPABILITY_LABELS[cap],
    state: liveCapabilities.has(cap) ? 'live' as const : 'coming_soon' as const,
  }));
}
