// The self-serve journey for a new brand, from DevShop entry to the first Monday result, as one deterministic
// reading of facts that already exist. It rides on the existing lead journey (src/lib/lead-journey.ts) and the
// ops setup tasks; it adds no stored state and performs no action. Every stage says how it proceeds
// (AUTO, WAITING_FOR_HUMAN, SETUP_REQUIRED), whether it is really implemented, and what a person must do.
import { indexOf, LIVE_IN_DAYS } from '../lead-journey';
import type { StandupTask } from '../retail-os-standup';
import type { ProvisioningRecord, ProvComponent } from './provisioning';
import type { HealthState } from './states';

export type JourneyState = 'AUTO' | 'WAITING_FOR_HUMAN' | 'SETUP_REQUIRED' | 'BLOCKED' | 'COMPLETE' | 'FAILED';
export type Implemented = 'yes' | 'partial' | 'no';

export interface JourneyFacts {
  leadStage: string | null;            // lead-journey stage, null when there is no lead
  applied: boolean;
  registryRow: boolean;
  provisioning: ProvisioningRecord | null;
  foundation: 'draft' | 'review' | 'approved' | 'committed' | 'superseded' | null;
  approvedProducts: number | null;
  agentId: string | null;
  dashboardDeployed: boolean | null;
  health: HealthState | null;
  firstActionDone: boolean;
  mondayResultProduced: boolean;
}

interface StageDef {
  id: string; label: string;
  mode: 'AUTO' | 'WAITING_FOR_HUMAN' | 'SETUP_REQUIRED';   // how the stage proceeds once reached
  implemented: Implemented;
  human: string;                                            // who must act, or "none"
  evidence: string;                                         // where the implementation is, or what is missing
}

export const JOURNEY_STAGES: StageDef[] = [
  { id: 'DISCOVER', label: 'Discover', mode: 'AUTO', implemented: 'yes', human: 'none', evidence: 'public site and /retail-os (src/pages)' },
  { id: 'APPLICATION', label: 'Application', mode: 'AUTO', implemented: 'yes', human: 'the founder submits the form', evidence: 'src/pages/retail-os/api/apply.ts (rate limited, tested)' },
  { id: 'QUALIFICATION', label: 'Qualification', mode: 'WAITING_FOR_HUMAN', implemented: 'yes', human: 'Virat approves the NDA, access and plan emails (auto-send is deliberately off)', evidence: 'src/lib/lead-journey.ts, lead-mail, lead-nda' },
  { id: 'COMMERCIAL', label: 'Commercial terms', mode: 'WAITING_FOR_HUMAN', implemented: 'yes', human: 'Virat sends the terms; the founder signs online', evidence: 'src/pages/retail-os/api/sign' },
  { id: 'PAYMENT_DEPOSIT', label: 'Deposit', mode: 'WAITING_FOR_HUMAN', implemented: 'yes', human: 'the founder pays by UPI; Virat confirms it', evidence: 'src/pages/retail-os/api/admin/mark-deposit-paid.ts. No gateway confirms it automatically' },
  { id: 'BRAND_CREATED', label: 'Brand created', mode: 'WAITING_FOR_HUMAN', implemented: 'partial', human: 'Virat adds the brand in /retail-os/admin/brands', evidence: 'brands table (migrations/0042_brands.sql). Nothing creates the row on deposit' },
  { id: 'PROVISIONING', label: 'Provisioning', mode: 'WAITING_FOR_HUMAN', implemented: 'partial', human: 'Virat assigns the build to the operations team; the founder and team then create accounts', evidence: 'src/lib/ops-seed.ts, src/pages/retail-os/api/admin/ops/assign-build.ts. Assignment is a deliberate manual step' },
  { id: 'FOUNDATION', label: 'Foundation', mode: 'WAITING_FOR_HUMAN', implemented: 'yes', human: 'the founder answers the gaps; Foundation is committed', evidence: 'src/lib/brand-foundation.ts and @retail-os/brand-config lifecycle' },
  { id: 'CATALOGUE', label: 'Catalogue', mode: 'WAITING_FOR_HUMAN', implemented: 'yes', human: 'the founder supplies products, costs and photos', evidence: 'src/lib/catalogue.ts (validation and go-live gates)' },
  { id: 'BRAND_PLANE', label: 'Brand plane', mode: 'SETUP_REQUIRED', implemented: 'partial', human: 'GitHub repo, Supabase project and Vercel project must be created with credentials', evidence: 'starter exists; provisioning from it has never been run into a real repo (RETAIL-OS-BRAND-PLANE.md)' },
  { id: 'DASHBOARD', label: 'Dashboard', mode: 'AUTO', implemented: 'partial', human: 'none once the brand plane is deployed', evidence: 'package dashboard-sections; Moon and Travaholic branches not merged' },
  { id: 'BRAND_CEO', label: 'Brand CEO', mode: 'WAITING_FOR_HUMAN', implemented: 'partial', human: 'Virat approves a new agent', evidence: 'src/lib/ceo/types.ts AGENT_REGISTRY is a static list; there is no create flow' },
  { id: 'HEALTH', label: 'Health', mode: 'AUTO', implemented: 'partial', human: 'none once deployed', evidence: 'src/lib/brand-node/adapter.ts; no brand repo exposes a health endpoint yet' },
  { id: 'FIRST_OPERATING_ACTION', label: 'First operating action', mode: 'AUTO', implemented: 'partial', human: 'none within the Brand CEO guardrails', evidence: 'Work Registry (src/lib/work) is complete but not wired to a live schedule' },
  { id: 'MONDAY_RESULT', label: 'Monday result', mode: 'AUTO', implemented: 'partial', human: 'none', evidence: 'src/pages/api/cron/founder-update.ts and retail-os-portfolio metrics, for registered brands' },
];

export interface JourneyStage {
  id: string; label: string; state: JourneyState; implemented: Implemented; human: string; evidence: string; waitingOn: string | null;
}

const stageIdx = (s: string | null) => (s ? indexOf(s) : -1);
const done = (r: ProvisioningRecord | null, ...cs: ProvComponent[]) => !!r && cs.every((c) => r.components.find((e) => e.component === c)?.state === 'COMPLETE');
const stuck = (r: ProvisioningRecord | null, ...cs: ProvComponent[]) => !!r && cs.some((c) => ['BLOCKED', 'FAILED'].includes(r.components.find((e) => e.component === c)?.state ?? ''));

export function evaluateJourney(f: JourneyFacts): JourneyStage[] {
  const i = stageIdx(f.leadStage);
  const p = f.provisioning;
  const complete: Record<string, boolean> = {
    DISCOVER: f.leadStage !== null,
    APPLICATION: f.applied,
    QUALIFICATION: i >= stageIdx('proposal'),
    COMMERCIAL: i >= stageIdx('signed'),
    PAYMENT_DEPOSIT: i >= stageIdx('deposit_paid') || done(p, 'payment'),
    BRAND_CREATED: f.registryRow,
    PROVISIONING: done(p, 'team', 'repository', 'database', 'environment'),
    FOUNDATION: f.foundation === 'committed',
    CATALOGUE: (f.approvedProducts ?? 0) > 0,
    BRAND_PLANE: done(p, 'deployment'),
    DASHBOARD: f.dashboardDeployed === true,
    BRAND_CEO: !!f.agentId,
    HEALTH: f.health === 'PASS',
    FIRST_OPERATING_ACTION: f.firstActionDone,
    MONDAY_RESULT: f.mondayResultProduced,
  };
  const blocked: Record<string, boolean> = {
    PROVISIONING: stuck(p, 'team', 'repository', 'database', 'environment'),
    BRAND_PLANE: stuck(p, 'deployment'),
    CATALOGUE: stuck(p, 'catalogue'),
  };
  let firstOpen: string | null = null;
  return JOURNEY_STAGES.map((d) => {
    const isDone = complete[d.id];
    const state: JourneyState = isDone ? 'COMPLETE' : d.id === 'HEALTH' && f.health === 'FAIL' ? 'FAILED' : blocked[d.id] ? 'BLOCKED' : d.mode;
    const waitingOn = !isDone && firstOpen ? firstOpen : null;
    if (!isDone && !firstOpen) firstOpen = d.label;
    return { id: d.id, label: d.label, state, implemented: d.implemented, human: d.human, evidence: d.evidence, waitingOn };
  });
}

/** The stage the brand is at: the first one not complete. */
export const currentStage = (stages: JourneyStage[]): JourneyStage | null => stages.find((s) => s.state !== 'COMPLETE') ?? null;

// ── The 7-day promise ─────────────────────────────────────────────────────────────────────────────

export type SevenDayStatus = 'ON_TRACK' | 'AT_RISK' | 'BLOCKED' | 'COMPLETE';
export type DatedTask = StandupTask & { due_on?: string | null };
export interface SevenDayRisk { task: string; owner: string; dueOn: string | null; daysLate: number; reason: string }
export interface SevenDay { status: SevenDayStatus; dayNumber: number; daysLeft: number; risks: SevenDayRisk[]; laterTasksWaiting: number }

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Day 0 is the build clock start. The promise is live by day 7. Dependencies are named, not guessed. */
export function sevenDay(tasks: DatedTask[], startedAt: string, now: Date, live: boolean): SevenDay {
  const counted = tasks.filter((t) => t.status !== 'na');
  const today = ymd(now);
  const dayNumber = Math.max(0, daysBetween(startedAt.slice(0, 10), today));
  const daysLeft = LIVE_IN_DAYS - dayNumber;
  const open = counted.filter((t) => t.status !== 'done');
  if (counted.length > 0 && open.length === 0) return { status: 'COMPLETE', dayNumber, daysLeft, risks: [], laterTasksWaiting: 0 };
  if (live) return { status: 'COMPLETE', dayNumber, daysLeft, risks: [], laterTasksWaiting: 0 };

  const risks: SevenDayRisk[] = [];
  for (const t of open) {
    const late = t.due_on ? Math.max(0, daysBetween(t.due_on, today)) : 0;
    if (t.status === 'blocked') risks.push({ task: t.task, owner: t.owner, dueOn: t.due_on ?? null, daysLate: late, reason: t.note?.trim() || 'marked blocked' });
    else if (late > 0) risks.push({ task: t.task, owner: t.owner, dueOn: t.due_on ?? null, daysLate: late, reason: `${late} day${late === 1 ? '' : 's'} past due, owned by ${t.owner}` });
  }
  if (counted.length === 0) return { status: dayNumber > 0 ? 'AT_RISK' : 'ON_TRACK', dayNumber, daysLeft, risks: dayNumber > 0 ? [{ task: 'no setup tasks exist', owner: 'virat', dueOn: null, daysLate: dayNumber, reason: 'the build clock is running but the build was never assigned' }] : [], laterTasksWaiting: 0 };

  const firstStage = risks.length ? Math.min(...open.filter((t) => risks.some((r) => r.task === t.task)).map((t) => t.stage)) : null;
  const laterTasksWaiting = firstStage === null ? 0 : open.filter((t) => t.stage > firstStage).length;
  // With a day or less left, go-live review (stage 9) is the last step: any earlier setup still open puts the promise at risk,
  // whether or not its task carried a due date.
  const early = open.filter((t) => t.stage < 9).sort((a, b) => a.stage - b.stage);
  if (daysLeft <= 1 && daysLeft >= 0 && early.length > 0 && !risks.some((r) => r.task === early[0].task)) {
    risks.push({ task: early[0].task, owner: early[0].owner, dueOn: early[0].due_on ?? null, daysLate: 0, reason: `day ${dayNumber} of ${LIVE_IN_DAYS}: ${early.length} setup task${early.length === 1 ? ' is' : 's are'} still open before the go-live review` });
  }
  const pastDay7 = dayNumber > LIVE_IN_DAYS;
  if (pastDay7) risks.push({ task: 'the 7 day promise', owner: 'team', dueOn: null, daysLate: dayNumber - LIVE_IN_DAYS, reason: `day ${dayNumber}, not live` });
  const status: SevenDayStatus = open.some((t) => t.status === 'blocked') ? 'BLOCKED' : risks.length ? 'AT_RISK' : 'ON_TRACK';
  return { status, dayNumber, daysLeft, risks, laterTasksWaiting };
}
