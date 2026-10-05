// Command Centre: the information architecture for a brand's operating overview.
// Pure contract — declares what the Command Centre CAN show, not what any brand
// currently has data for. Each capability is a named slot with a state.

import type { ModuleState } from './types';

export const COMMAND_CENTRE_CAPABILITIES = [
  'business_health',
  'revenue',
  'orders',
  'customers',
  'retention',
  'inventory_exceptions',
  'finance_exceptions',
  'growth_performance',
  'operational_issues',
  'work_items',
  'approvals',
  'alerts',
  'opportunities',
] as const;
export type CommandCentreCapability = (typeof COMMAND_CENTRE_CAPABILITIES)[number];

export interface CommandCentreSlot {
  capability: CommandCentreCapability;
  label: string;
  state: ModuleState;
  description: string;
}

export const CAPABILITY_LABELS: Record<CommandCentreCapability, { label: string; description: string }> = {
  business_health: { label: 'Business Health', description: 'Overall health score and status indicators' },
  revenue: { label: 'Revenue', description: 'Net sales, gross sales, refunds for the selected period' },
  orders: { label: 'Orders', description: 'Order count, fulfilment status, paid-not-shipped' },
  customers: { label: 'Customers', description: 'New and returning customers for the period' },
  retention: { label: 'Repeat Customer Rate', description: 'Cohort and period repeat-purchase indicators' },
  inventory_exceptions: { label: 'Inventory Exceptions', description: 'Out of stock, low stock, excess stock' },
  finance_exceptions: { label: 'Finance Exceptions', description: 'Unsettled payments, overdue invoices, P&L anomalies' },
  growth_performance: { label: 'Growth Performance', description: 'Ad spend, cost per order, ROAS, channel mix' },
  operational_issues: { label: 'Operational Issues', description: 'Shipping delays, returns, delivery failures' },
  work_items: { label: 'Important Work', description: 'Active Work Registry items for this brand' },
  approvals: { label: 'Approvals', description: 'Pending approvals requiring decision' },
  alerts: { label: 'Alerts', description: 'System alerts, health-check failures, integration issues' },
  opportunities: { label: 'Opportunities', description: 'Growth opportunities and improvement suggestions' },
};

/**
 * Resolve the Command Centre slots for a brand. Each capability is either live (the brand has
 * the data source), coming_soon (the architecture supports it but data doesn't exist yet), or
 * another state. The caller provides a set of capabilities that are currently live.
 */
export function resolveCommandCentre(liveCapabilities: Set<CommandCentreCapability>): CommandCentreSlot[] {
  return COMMAND_CENTRE_CAPABILITIES.map((cap): CommandCentreSlot => ({
    capability: cap,
    label: CAPABILITY_LABELS[cap].label,
    description: CAPABILITY_LABELS[cap].description,
    state: liveCapabilities.has(cap) ? 'live' : 'coming_soon',
  }));
}
