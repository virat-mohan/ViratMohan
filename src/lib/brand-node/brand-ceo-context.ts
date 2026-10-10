// Brand CEO operational context: makes a Brand CEO more than a registered agent.
// A brand_ceo agent is "operationally bound" when it can:
//   - read its brand's identity and foundation status
//   - see health components
//   - see current KPIs
//   - receive and create scoped work
//   - escalate correctly through DS-02 Dev
//   - report a structured result
//
// This is pure TypeScript: no network, no framework. The production server passes
// real implementations; tests pass lightweight stubs.

import type { InMemoryWorkRegistry } from '../work/registry';
import type { WorkItem } from '../work/types';
import { Scopes } from '../work/scope';
import { VIRAT } from '../work/actors';
import type { BrandNode, BrandMetrics } from './adapter';
import { readHealth, readMetrics } from './adapter';
import type { HealthComponent, HealthState } from './states';
import { rollupHealth } from './states';
import type { AgentEntry } from '../ceo/types';
import { brandCeoFor, findAgent } from '../ceo/types';
import type { ProvisioningRecord } from './provisioning';
import type { JourneyStage } from './journey';

// ── Authority levels (matches the Work Registry governance model) ─────────────────────────────────

export type CeoAuthorityLevel =
  | 'brand_operating'       // routine brand operations: content, store, catalogue within guardrails
  | 'brand_strategic'       // pricing, promotions, significant changes — requires DS-02 acknowledgement
  | 'brand_financial'       // money movements, ad budget changes — requires DS-00 Virat approval
  | 'cross_brand'           // any action touching more than one brand — always escalates
  | 'none';                 // not bound, cannot act

export interface AuthorityBound {
  level: CeoAuthorityLevel;
  maxAdSpendChange: number | null;  // INR per day change limit; null = must escalate
  canCreateWork: boolean;
  canCloseWork: boolean;
  canApprove: boolean;              // CEO agents never approve (per CLAUDE.md)
  escalatesTo: string;              // agent id
}

const BRAND_CEO_AUTHORITY: AuthorityBound = {
  level: 'brand_operating',
  maxAdSpendChange: 500,       // ₹500/day change without approval
  canCreateWork: true,
  canCloseWork: true,
  canApprove: false,           // CEO agents never approve — CLAUDE.md rule
  escalatesTo: 'DS-02',
};

// ── KPI snapshot ──────────────────────────────────────────────────────────────────────────────────

export interface BrandKPI {
  revenue: number | null;
  orders: number | null;
  newCustomers: number | null;
  repeatCustomerRate: number | null;
  roas: number | null;
  contribution: number | null;
  adSpend: number | null;
  source: string;
}

function kpiFromMetrics(m: BrandMetrics): BrandKPI {
  return {
    revenue: m.revenue,
    orders: m.orders,
    newCustomers: m.newCustomers,
    repeatCustomerRate: m.repeatCustomerRate,
    roas: m.roas,
    contribution: m.contribution,
    adSpend: m.adSpend,
    source: m.source,
  };
}

// ── Work summary ──────────────────────────────────────────────────────────────────────────────────

export interface WorkScopeView {
  open: number;
  blocked: number;
  waiting: number;
  criticalCount: number;
  recentItems: Array<{ id: string; ref: string; title: string; state: string; priority: string | null }>;
}

function workScopeFor(brandKey: string, registry: InMemoryWorkRegistry | null): WorkScopeView {
  if (!registry) return { open: 0, blocked: 0, waiting: 0, criticalCount: 0, recentItems: [] };
  const items = registry.list().filter((i) => i.scope.kind === 'brand' && (i.scope as { brand: string }).brand === brandKey);
  const open = items.filter((i) => !['closed', 'resolved'].includes(i.state));
  const blocked = open.filter((i) => i.state === 'blocked').length;
  const waiting = open.filter((i) => i.state === 'waiting').length;
  const critical = open.filter((i) => i.priority === 'P0' || i.priority === 'P1').length;
  const recent = open
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5)
    .map((i) => ({ id: i.id, ref: i.ref, title: i.title, state: i.state, priority: i.priority }));
  return { open: open.length, blocked, waiting, criticalCount: critical, recentItems: recent };
}

// ── Brand CEO Context ─────────────────────────────────────────────────────────────────────────────

export type CeoBindingState =
  | 'BOUND'           // node + agent + work scope all present; CEO is operational
  | 'PARTIAL'         // agent registered, node exists, but health/metrics ports not live
  | 'AGENT_ONLY'      // agent registered but no BrandNode exists
  | 'NOT_REGISTERED'; // no agent for this brand key

export interface BrandCeoContext {
  brandKey: string;
  agent: AgentEntry | undefined;
  bindingState: CeoBindingState;
  authority: AuthorityBound;
  identity: ReturnType<BrandNode['identity']> | null;
  kpi: BrandKPI | null;
  health: { rollup: HealthState; components: HealthComponent[] } | null;
  work: WorkScopeView;
  provisioning: ProvisioningRecord | null;
  journey: JourneyStage | null;    // current (first incomplete) stage
  escalationPath: AgentEntry[];    // ordered: CEO → DS-02 → DS-00
  boundAt: string;                 // ISO timestamp
}

export async function bindBrandCeo(
  brandKey: string,
  node: BrandNode | null,
  registry: InMemoryWorkRegistry | null,
  provisioning: ProvisioningRecord | null,
  currentStage: JourneyStage | null,
  now = new Date(),
): Promise<BrandCeoContext> {
  const agent = brandCeoFor(brandKey);
  const ds02 = findAgent('DS-02');
  const ds00 = findAgent('DS-00');
  const escalation = [ds02, ds00].filter((a): a is AgentEntry => !!a);

  if (!agent) {
    return {
      brandKey, agent: undefined, bindingState: 'NOT_REGISTERED', authority: { ...BRAND_CEO_AUTHORITY, level: 'none', canCreateWork: false, canCloseWork: false },
      identity: null, kpi: null, health: null,
      work: workScopeFor(brandKey, registry),
      provisioning, journey: currentStage,
      escalationPath: escalation, boundAt: now.toISOString(),
    };
  }

  if (!node) {
    return {
      brandKey, agent, bindingState: 'AGENT_ONLY', authority: { ...BRAND_CEO_AUTHORITY, level: 'none', canCreateWork: true, canCloseWork: false },
      identity: null, kpi: null, health: null,
      work: workScopeFor(brandKey, registry),
      provisioning, journey: currentStage,
      escalationPath: escalation, boundAt: now.toISOString(),
    };
  }

  const identity = node.identity();
  const [components, metrics] = await Promise.all([
    readHealth(node),
    readMetrics(node),
  ]);
  const rollup = rollupHealth(components);
  const hasPorts = !!(node.healthPort || node.metricsPort);
  const bindingState: CeoBindingState = hasPorts ? 'BOUND' : 'PARTIAL';

  return {
    brandKey, agent, bindingState,
    authority: BRAND_CEO_AUTHORITY,
    identity,
    kpi: kpiFromMetrics(metrics),
    health: { rollup, components },
    work: workScopeFor(brandKey, registry),
    provisioning, journey: currentStage,
    escalationPath: escalation, boundAt: now.toISOString(),
  };
}

// ── Result type for CEO reporting ─────────────────────────────────────────────────────────────────

export interface CeoOperatingResult {
  agentId: string;
  brandKey: string;
  summary: string;
  healthRollup: HealthState;
  kpiSnapshot: BrandKPI | null;
  workOpen: number;
  workBlocked: number;
  actionsTaken: string[];
  escalations: string[];
  nextStep: string;
  producedAt: string;
}

export function buildCeoResult(
  ctx: BrandCeoContext,
  actionsTaken: string[],
  escalations: string[],
  nextStep: string,
  now = new Date(),
): CeoOperatingResult {
  return {
    agentId: ctx.agent?.id ?? 'unknown',
    brandKey: ctx.brandKey,
    summary: `${ctx.agent?.name ?? ctx.brandKey}: ${ctx.bindingState === 'BOUND' ? 'operational' : ctx.bindingState.toLowerCase()}`,
    healthRollup: ctx.health?.rollup ?? 'UNKNOWN',
    kpiSnapshot: ctx.kpi,
    workOpen: ctx.work.open,
    workBlocked: ctx.work.blocked,
    actionsTaken, escalations, nextStep,
    producedAt: now.toISOString(),
  };
}
