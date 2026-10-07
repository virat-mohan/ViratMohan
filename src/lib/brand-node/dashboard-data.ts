// Standard dashboard data layer.
// Aggregates from BrandNode (health, metrics, capabilities), provisioning record,
// journey stage, and Work Registry into a single BrandDashboardData object.
// This is the canonical source for any brand dashboard shell — brand repos consume this,
// they do not build their own aggregation logic.
//
// Module states map directly to CLAUDE.md section 6:
//   LIVE | AVAILABLE | SETUP_REQUIRED | COMMERCIAL | CLIENT_SPECIFIC | DEFERRED

import type { BrandNode, Capability, CapabilityState } from './adapter';
import { readHealth, readMetrics, boundPorts } from './adapter';
import type { HealthState, HealthComponent } from './states';
import { rollupHealth } from './states';
import type { ProvisioningRecord } from './provisioning';
import type { JourneyStage } from './journey';
import type { BrandCeoContext } from './brand-ceo-context';
import type { InMemoryWorkRegistry } from '../work/registry';

// ── Module definitions (canonical sections from CLAUDE.md) ──────────────────────────────────────

export type DashboardSection =
  | 'command_centre'
  | 'brand'
  | 'catalogue'
  | 'commerce'
  | 'growth'
  | 'inventory_master'
  | 'finance'
  | 'operations'
  | 'team_partners'
  | 'reports'
  | 'settings';

export const DASHBOARD_SECTIONS: DashboardSection[] = [
  'command_centre', 'brand', 'catalogue', 'commerce', 'growth',
  'inventory_master', 'finance', 'operations', 'team_partners', 'reports', 'settings',
];

export type ModuleState = CapabilityState;

export interface DashboardModule {
  section: DashboardSection;
  label: string;
  state: ModuleState;
  note: string;
  /** The capability key(s) that back this section, if any */
  capabilityKeys: string[];
}

// Maps dashboard sections to capability keys for state derivation
const SECTION_TO_CAPS: Record<DashboardSection, string[]> = {
  command_centre: [],                // always shown; state derived from health
  brand: [],                         // always shown; state from foundation
  catalogue: ['catalogue'],
  commerce: ['commerce'],
  growth: ['growth'],
  inventory_master: ['inventory'],
  finance: ['finance'],
  operations: ['operations'],
  team_partners: [],
  reports: [],
  settings: [],
};

const SECTION_LABELS: Record<DashboardSection, string> = {
  command_centre: 'Command Centre',
  brand: 'Brand / Foundation',
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

function moduleStateFor(section: DashboardSection, capabilities: Capability[], healthRollup: HealthState): ModuleState {
  if (section === 'command_centre') {
    // Command Centre is always available; its state reflects the overall health
    return healthRollup === 'UNKNOWN' ? 'SETUP_REQUIRED' : 'LIVE';
  }
  if (section === 'brand' || section === 'settings' || section === 'team_partners' || section === 'reports') {
    return 'AVAILABLE';
  }
  const keys = SECTION_TO_CAPS[section];
  if (keys.length === 0) return 'AVAILABLE';
  const cap = capabilities.find((c) => keys.includes(c.key));
  return cap?.state ?? 'SETUP_REQUIRED';
}

function moduleNoteFor(section: DashboardSection, capabilities: Capability[], healthRollup: HealthState): string {
  if (section === 'command_centre') return healthRollup === 'UNKNOWN' ? 'health not yet established' : `health: ${healthRollup}`;
  const keys = SECTION_TO_CAPS[section];
  if (keys.length === 0) return '';
  const cap = capabilities.find((c) => keys.includes(c.key));
  return cap?.note ?? '';
}

// ── KPI row ──────────────────────────────────────────────────────────────────────────────────────

export interface DashboardKPI {
  revenue: number | null;
  orders: number | null;
  contribution: number | null;
  roas: number | null;
  repeatCustomerRate: number | null;
  adSpend: number | null;
  newCustomers: number | null;
  metricsSource: string;
  metricsLive: boolean;
}

// ── Work snapshot ─────────────────────────────────────────────────────────────────────────────────

export interface DashboardWork {
  open: number;
  blocked: number;
  critical: number;
  provisioningIncomplete: number;
}

// ── Full dashboard data ───────────────────────────────────────────────────────────────────────────

export interface BrandDashboardData {
  brandKey: string;
  brandName: string;
  status: string;
  domain: string | null;
  foundation: string;
  healthRollup: HealthState;
  healthComponents: HealthComponent[];
  kpi: DashboardKPI;
  modules: DashboardModule[];
  work: DashboardWork;
  provisioning: {
    overall: string;
    complete: number;
    total: number;
    nextAction: { component: string; owner: string | null; detail: string } | null;
  } | null;
  currentJourneyStage: JourneyStage | null;
  ceoBinding: string;           // 'BOUND' | 'PARTIAL' | 'AGENT_ONLY' | 'NOT_REGISTERED'
  capabilities: Capability[];
  dataFreshAt: string;
}

export async function buildDashboardData(
  node: BrandNode,
  provisioning: ProvisioningRecord | null,
  currentStage: JourneyStage | null,
  ceoCtx: BrandCeoContext | null,
  registry: InMemoryWorkRegistry | null,
  now = new Date(),
): Promise<BrandDashboardData> {
  const identity = node.identity();
  const capabilities = node.capabilities();
  const ports = boundPorts(node);

  const [healthComponents, metrics] = await Promise.all([
    readHealth(node),
    readMetrics(node),
  ]);
  const healthRollup = rollupHealth(healthComponents);

  const modules = DASHBOARD_SECTIONS.map((section): DashboardModule => ({
    section,
    label: SECTION_LABELS[section],
    state: moduleStateFor(section, capabilities, healthRollup),
    note: moduleNoteFor(section, capabilities, healthRollup),
    capabilityKeys: SECTION_TO_CAPS[section],
  }));

  // Work snapshot from registry
  const work: DashboardWork = { open: 0, blocked: 0, critical: 0, provisioningIncomplete: 0 };
  if (registry) {
    const items = registry.list().filter(
      (i) => i.scope.kind === 'brand' && (i.scope as { brand: string }).brand === identity.brandId,
    );
    const open = items.filter((i) => !['closed', 'resolved'].includes(i.state));
    work.open = open.length;
    work.blocked = open.filter((i) => i.state === 'blocked').length;
    work.critical = open.filter((i) => i.priority === 'P0' || i.priority === 'P1').length;
    work.provisioningIncomplete = provisioning ? provisioning.total - provisioning.complete : 0;
  }

  return {
    brandKey: identity.brandId,
    brandName: identity.name,
    status: identity.status,
    domain: identity.domain,
    foundation: identity.foundation,
    healthRollup,
    healthComponents,
    kpi: {
      revenue: metrics.revenue,
      orders: metrics.orders,
      contribution: metrics.contribution,
      roas: metrics.roas,
      repeatCustomerRate: metrics.repeatCustomerRate,
      adSpend: metrics.adSpend,
      newCustomers: metrics.newCustomers,
      metricsSource: metrics.source,
      metricsLive: ports.metrics,
    },
    modules,
    work,
    provisioning: provisioning
      ? {
          overall: provisioning.overall,
          complete: provisioning.complete,
          total: provisioning.total,
          nextAction: provisioning.nextAction,
        }
      : null,
    currentJourneyStage: currentStage,
    ceoBinding: ceoCtx?.bindingState ?? 'NOT_REGISTERED',
    capabilities,
    dataFreshAt: now.toISOString(),
  };
}
