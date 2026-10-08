// Extended CEO context: assembles the full operating picture across agents, humans,
// brands, onboarding, training and decisions. Used by the Founder Command Centre
// to answer questions like "What needs my attention?", "How is Moon performing?",
// "What is Prince working on?", "Is our CMO trained enough?"
// Pure deterministic assembly. No AI invocations.

import type { InMemoryWorkRegistry } from '../work/registry';
import type { WorkItem } from '../work/types';
import type { ContextPack } from './context-pack';
import { buildContextPack } from './context-pack';
import type { FounderInput } from './founder-input';
import { AGENT_REGISTRY, findAgent, brandCeoFor, directReports, type AgentEntry } from './types';
import {
  buildAllPassports, certificationSummary, scenariosForAgent,
  canExerciseAutonomy, computeGaps, trainingModulesFor,
  type AgentPassport, type CertLevel, type AssessmentResult,
} from './agent-training';
import {
  HUMAN_REGISTRY, findWorker, workerWorkView, workerPerformance,
  peopleSummary, type HumanWorker, type WorkerWorkView, type WorkerPerformance,
} from './people';
import type { OrgDecision, OnboardingRecord, DashboardConfig } from './db-stores';

export interface AgentOperatingState {
  agent: AgentEntry;
  certification: CertLevel;
  gaps: string[];
  scenario_count: number;
  can_operate_autonomously: boolean;
}

export interface HumanOperatingState {
  worker: HumanWorker;
  workView: WorkerWorkView;
  performance: WorkerPerformance;
}

export interface BrandOperatingState {
  brand_key: string;
  brand_ceo: AgentEntry | null;
  onboarding: OnboardingRecord | null;
  dashboard: DashboardConfig | null;
  open_work_count: number;
  critical_count: number;
  blocked_count: number;
}

export interface ExtendedCeoContext {
  base: ContextPack;
  agents: AgentOperatingState[];
  humans: HumanOperatingState[];
  brands: BrandOperatingState[];
  recent_decisions: OrgDecision[];
  onboarding_brands: OnboardingRecord[];
}

export function buildExtendedContext(
  input: FounderInput,
  registry: InMemoryWorkRegistry,
  opts: {
    now?: Date;
    decisions?: OrgDecision[];
    onboarding?: OnboardingRecord[];
    dashboards?: DashboardConfig[];
    storedAssessments?: Map<string, AssessmentResult[]>;
  } = {},
): ExtendedCeoContext {
  const now = opts.now ?? new Date();
  const base = buildContextPack(input, registry, now);
  const items = registry.list();

  const agents: AgentOperatingState[] = AGENT_REGISTRY
    .filter(a => a.id !== 'DS-00')
    .map(a => {
      const stored = opts.storedAssessments?.get(a.id);
      const singleMap = stored ? new Map([[a.id, stored]]) : undefined;
      return {
        agent: a,
        certification: certificationSummary(now, singleMap).find(s => s.agent_id === a.id)?.certification ?? 'TRAINING_REQUIRED' as CertLevel,
        gaps: computeGaps(trainingModulesFor(a.id), stored ?? []),
        scenario_count: scenariosForAgent(a.id).length,
        can_operate_autonomously: canExerciseAutonomy(a.id, 'CERTIFIED_L1', stored),
      };
    });

  const humans: HumanOperatingState[] = HUMAN_REGISTRY.map(w => ({
    worker: w,
    workView: workerWorkView(w.id, items, now),
    performance: workerPerformance(w.id, items, now),
  }));

  const brandKeys = new Set<string>();
  for (const a of AGENT_REGISTRY) {
    if (a.scope?.brand) brandKeys.add(a.scope.brand);
  }

  const brands: BrandOperatingState[] = [...brandKeys].map(bk => {
    const brandItems = items.filter(i => i.scope.brand === bk && i.state !== 'closed');
    return {
      brand_key: bk,
      brand_ceo: brandCeoFor(bk) ?? null,
      onboarding: opts.onboarding?.find(o => o.brand_key === bk) ?? null,
      dashboard: opts.dashboards?.find(d => d.brand_key === bk) ?? null,
      open_work_count: brandItems.length,
      critical_count: brandItems.filter(i => i.priority === 'P0' || i.priority === 'P1').length,
      blocked_count: brandItems.filter(i => i.state === 'blocked').length,
    };
  });

  return {
    base,
    agents,
    humans,
    brands,
    recent_decisions: opts.decisions ?? [],
    onboarding_brands: opts.onboarding ?? [],
  };
}

// ── CEO answer helpers for common founder questions ─────────────────────────

export function answerPrinceWork(ctx: ExtendedCeoContext): string {
  const prince = ctx.humans.find(h => h.worker.id === 'P-01');
  if (!prince) return 'Prince is not in the registry.';
  const { performance: p, workView: v } = prince;
  const parts = [`Prince has ${p.tasks_total} work items: ${p.tasks_in_progress} in progress, ${p.tasks_done} completed, ${p.tasks_overdue} overdue, ${p.tasks_blocked} blocked.`];
  if (v.overdue.length > 0) parts.push(`Overdue: ${v.overdue.map(i => i.title).join('; ')}.`);
  if (v.in_progress.length > 0) parts.push(`Working on: ${v.in_progress.map(i => i.title).join('; ')}.`);
  if (p.sla_adherence != null) parts.push(`SLA adherence: ${p.sla_adherence}%.`);
  return parts.join(' ');
}

export function answerAgentTraining(agentId: string, ctx: ExtendedCeoContext): string {
  const entry = ctx.agents.find(a => a.agent.id === agentId);
  if (!entry) return `Agent ${agentId} not found.`;
  const { agent, certification, gaps, scenario_count, can_operate_autonomously } = entry;
  const parts = [`${agent.id} ${agent.name} (${agent.role}): certification ${certification}, ${scenario_count} scenarios available.`];
  if (gaps.length > 0) parts.push(`Gaps: ${gaps.join('; ')}.`);
  parts.push(can_operate_autonomously ? 'Can operate autonomously.' : 'Cannot operate autonomously yet.');
  return parts.join(' ');
}

export function answerBrandStatus(brandKey: string, ctx: ExtendedCeoContext): string {
  const brand = ctx.brands.find(b => b.brand_key === brandKey);
  if (!brand) return `Brand "${brandKey}" not found.`;
  const parts = [`Brand "${brandKey}": ${brand.open_work_count} open work items, ${brand.critical_count} critical, ${brand.blocked_count} blocked.`];
  if (brand.brand_ceo) parts.push(`CEO: ${brand.brand_ceo.id} ${brand.brand_ceo.name}.`);
  if (brand.onboarding) parts.push(`Onboarding stage: ${brand.onboarding.stage}, overall: ${brand.onboarding.overall}.`);
  return parts.join(' ');
}

export function answerOnboarding(ctx: ExtendedCeoContext): string {
  const onboarding = ctx.onboarding_brands.filter(o => o.overall !== 'COMPLETE');
  if (onboarding.length === 0) return 'No brands currently onboarding.';
  return `${onboarding.length} brand(s) onboarding: ${onboarding.map(o => `${o.brand_key} (${o.stage}, ${o.overall})`).join('; ')}.`;
}

export function answerAttention(ctx: ExtendedCeoContext): string {
  const parts: string[] = [];
  const board = ctx.base.morningBoard;
  if (board) {
    parts.push(`${board.items.length} items on the morning board: ${board.critical_count} critical, ${board.blocked_count} blocked, ${board.pending_approval_count} pending approval.`);
  }
  const overdue = ctx.humans.flatMap(h => h.workView.overdue);
  if (overdue.length > 0) parts.push(`${overdue.length} overdue human tasks.`);
  const uncertified = ctx.agents.filter(a => a.certification === 'TRAINING_REQUIRED');
  if (uncertified.length > 0) parts.push(`${uncertified.length} agents untrained.`);
  const onboarding = ctx.onboarding_brands.filter(o => o.overall !== 'COMPLETE');
  if (onboarding.length > 0) parts.push(`${onboarding.length} brands onboarding.`);
  if (parts.length === 0) parts.push('Nothing urgent requires attention.');
  return parts.join(' ');
}
