// Self-serve onboarding operations: turns the journey reader into an actionable flow.
// Each incomplete stage produces an assignment: who acts, what the evidence is, and what
// system state changes when it completes. The Work Registry records these assignments.
//
// Human gates are kept to the minimum set dictated by the journey definitions:
//   - Agreement signature (founder)
//   - Deposit payment (founder → Virat confirms)
//   - Brand creation in admin (Virat, deliberate)
//   - Ops team assignment (Virat, deliberate)
//   - Foundation Q&A (founder)
//   - Catalogue upload (founder)
//   - Go-live sign-off (Virat, deliberate)
//
// Everything else is AUTO or SETUP_REQUIRED (infrastructure, not human decisions).

import type { JourneyStage, JourneyState } from './journey';
import { currentStage as findCurrentStage } from './journey';
import type { InMemoryWorkRegistry } from '../work/registry';
import { Scopes } from '../work/scope';
import { VIRAT } from '../work/actors';

// ── Assignment model ──────────────────────────────────────────────────────────────────────────────

export type AssignmentKind =
  | 'auto'                 // system does it; no human required
  | 'waiting_founder'      // founder must act
  | 'waiting_virat'        // Virat must act (deliberate human gate)
  | 'waiting_team'         // ops team action required
  | 'setup_required'       // infrastructure to be created (Prince / team)
  | 'blocked'              // something is stopping progress
  | 'complete';

export interface StageAssignment {
  stageId: string;
  stageLabel: string;
  journeyState: JourneyState;
  kind: AssignmentKind;
  owner: string;
  action: string;
  evidence: string;
  workId: string | null;   // Work Registry item id when one is created
}

// Maps journey stage ids to owner and action descriptions
const STAGE_META: Record<string, { owner: string; action: string; kind: AssignmentKind }> = {
  DISCOVER: { owner: 'system', action: 'Public site and /retail-os describe the product', kind: 'auto' },
  APPLICATION: { owner: 'founder', action: 'Founder submits the /retail-os/apply form', kind: 'waiting_founder' },
  QUALIFICATION: { owner: 'virat', action: 'Virat approves NDA, access and plan emails', kind: 'waiting_virat' },
  COMMERCIAL: { owner: 'founder', action: 'Virat sends terms; founder signs online', kind: 'waiting_founder' },
  PAYMENT_DEPOSIT: { owner: 'founder', action: 'Founder pays ₹5,000 deposit by UPI; Virat confirms', kind: 'waiting_virat' },
  BRAND_CREATED: { owner: 'virat', action: 'Virat adds the brand in /retail-os/admin/brands', kind: 'waiting_virat' },
  PROVISIONING: { owner: 'virat', action: 'Virat assigns build to operations team', kind: 'waiting_virat' },
  FOUNDATION: { owner: 'founder', action: 'Founder answers Foundation gaps; Foundation committed', kind: 'waiting_founder' },
  CATALOGUE: { owner: 'founder', action: 'Founder supplies products, costs and photos', kind: 'waiting_founder' },
  BRAND_PLANE: { owner: 'team', action: 'GitHub repo, Supabase project and Vercel project created', kind: 'setup_required' },
  DASHBOARD: { owner: 'system', action: 'Brand plane deployed; dashboard initialises', kind: 'auto' },
  BRAND_CEO: { owner: 'virat', action: 'Virat approves a new Brand CEO agent', kind: 'waiting_virat' },
  HEALTH: { owner: 'system', action: 'All health components report PASS', kind: 'auto' },
  FIRST_OPERATING_ACTION: { owner: 'system', action: 'Brand CEO executes first work item within guardrails', kind: 'auto' },
  MONDAY_RESULT: { owner: 'system', action: 'Founder update cron produces first Monday result', kind: 'auto' },
};

// ── Assignment builder ────────────────────────────────────────────────────────────────────────────

function assignmentKindFor(stage: JourneyStage): AssignmentKind {
  if (stage.state === 'COMPLETE') return 'complete';
  if (stage.state === 'FAILED') return 'blocked';
  if (stage.state === 'BLOCKED') return 'blocked';
  const meta = STAGE_META[stage.id];
  if (!meta) return 'setup_required';
  return meta.kind;
}

/**
 * Build assignments for all incomplete journey stages.
 * Creates Work items in the registry for stages that need human action.
 * Already-COMPLETE stages are skipped.
 * AUTO stages get no Work item (system handles them).
 */
export function buildOnboardingAssignments(
  brandKey: string,
  stages: JourneyStage[],
  registry: InMemoryWorkRegistry | null,
  now = new Date(),
): StageAssignment[] {
  const assignments: StageAssignment[] = [];

  for (const stage of stages) {
    const meta = STAGE_META[stage.id] ?? { owner: 'team', action: stage.human, kind: 'setup_required' as AssignmentKind };
    const kind = assignmentKindFor(stage);

    if (kind === 'complete') {
      assignments.push({ stageId: stage.id, stageLabel: stage.label, journeyState: stage.state, kind, owner: meta.owner, action: meta.action, evidence: stage.evidence, workId: null });
      continue;
    }

    // AUTO stages don't need Work items
    if (kind === 'auto') {
      assignments.push({ stageId: stage.id, stageLabel: stage.label, journeyState: stage.state, kind, owner: meta.owner, action: meta.action, evidence: stage.evidence, workId: null });
      continue;
    }

    // For human gates, create a Work item if registry provided and one doesn't exist
    let workId: string | null = null;
    if (registry) {
      const existing = registry.list().find(
        (i) =>
          i.scope.kind === 'brand' &&
          (i.scope as { brand: string }).brand === brandKey &&
          i.title.includes(`onboarding: ${stage.id}`) &&
          !['closed', 'resolved'].includes(i.state),
      );
      if (existing) {
        workId = existing.id;
      } else {
        // Only create for the CURRENT stage (first incomplete) and next 2 stages
        // Creating all stages upfront floods the registry
        const currentIdx = stages.findIndex((s) => s.state !== 'COMPLETE');
        const stageIdx = stages.indexOf(stage);
        if (stageIdx <= currentIdx + 2) {
          const r = registry.createItem(
            {
              type: 'task',
              title: `[${brandKey}] onboarding: ${stage.id} — ${stage.label}`,
              description: `${meta.action}\n\nEvidence: ${stage.evidence}`,
              scope: Scopes.brand(brandKey),
              source: { channel: 'internal' },
            },
            VIRAT,
          );
          if (r.ok) workId = r.value.id;
        }
      }
    }

    assignments.push({ stageId: stage.id, stageLabel: stage.label, journeyState: stage.state, kind, owner: meta.owner, action: meta.action, evidence: stage.evidence, workId });
  }

  return assignments;
}

// ── Self-serve flow summary ───────────────────────────────────────────────────────────────────────

export interface SelfServeFlow {
  brandKey: string;
  currentStageId: string | null;
  currentStagelabel: string | null;
  currentOwner: string | null;
  currentAction: string | null;
  completedStages: number;
  totalStages: number;
  percentComplete: number;
  humanGatesRemaining: number;
  assignments: StageAssignment[];
  nextHumanGate: StageAssignment | null;
  isComplete: boolean;
}

export function buildSelfServeFlow(
  brandKey: string,
  stages: JourneyStage[],
  registry: InMemoryWorkRegistry | null,
  now = new Date(),
): SelfServeFlow {
  const assignments = buildOnboardingAssignments(brandKey, stages, registry, now);
  const current = findCurrentStage(stages);
  const completed = stages.filter((s) => s.state === 'COMPLETE').length;
  const humanGates = assignments.filter((a) => ['waiting_founder', 'waiting_virat', 'waiting_team'].includes(a.kind));
  const nextHumanGate = humanGates.find((a) => a.kind !== 'complete') ?? null;

  return {
    brandKey,
    currentStageId: current?.id ?? null,
    currentStagelabel: current?.label ?? null,
    currentOwner: current ? (STAGE_META[current.id]?.owner ?? 'team') : null,
    currentAction: current ? (STAGE_META[current.id]?.action ?? current.human) : null,
    completedStages: completed,
    totalStages: stages.length,
    percentComplete: Math.round((completed / stages.length) * 100),
    humanGatesRemaining: humanGates.length,
    assignments,
    nextHumanGate,
    isComplete: current === null,
  };
}
