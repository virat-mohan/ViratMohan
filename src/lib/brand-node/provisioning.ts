// One provisioning record per brand, derived (never stored a second time) from the facts that already exist:
// the brands registry row, the lead/application, the Brand Foundation, the ops setup tasks (ops-seed.ts) and
// the Work Registry item id. It marks nothing complete on anyone's behalf and creates no tasks.
import type { StandupTask } from '../retail-os-standup';
import type { BrandStatus } from './adapter';
import type { HealthState } from './states';

export type ProvState = 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'COMPLETE' | 'FAILED';
export type ProvOwner = 'system' | 'virat' | 'founder' | 'team' | 'brand';

export const PROVISIONING_COMPONENTS = [
  'client', 'brand', 'agreement', 'payment', 'brand_registry', 'foundation', 'repository', 'database', 'environment', 'deployment',
  'domain', 'payments', 'catalogue', 'commerce', 'email', 'whatsapp', 'analytics', 'team', 'agents', 'dashboard', 'health', 'go_live',
] as const;
export type ProvComponent = (typeof PROVISIONING_COMPONENTS)[number];

export interface ProvisioningFacts {
  brandKey: string;
  clientName: string | null;
  agreementSigned: boolean | null;
  depositPaid: boolean | null;
  registryStatus: BrandStatus | null;
  foundation: 'draft' | 'review' | 'approved' | 'committed' | 'superseded' | null;
  approvedProducts: number | null;
  agentId: string | null;
  dashboardDeployed: boolean | null;
  health: HealthState | null;
  tasks: StandupTask[];
  workId: string | null;
  /** Facts checked against the real system. They override task bookkeeping, which can lag reality (Fresh's database existed while its ops task still read pending). */
  observed?: Partial<Record<ProvComponent, { state: ProvState; detail: string }>>;
}

export interface ProvisioningEntry { component: ProvComponent; state: ProvState; owner: ProvOwner | null; detail: string }
export interface ProvisioningRecord {
  brandKey: string;
  workId: string | null;
  overall: ProvState;
  components: ProvisioningEntry[];
  complete: number;
  total: number;
  nextAction: { component: ProvComponent; owner: ProvOwner | null; detail: string } | null;
  blockers: ProvisioningEntry[];
}

const EXTERNAL: ProvOwner[] = ['founder', 'brand'];
const entry = (component: ProvComponent, state: ProvState, owner: ProvOwner | null, detail: string): ProvisioningEntry => ({ component, state, owner, detail });

/** State of the ops tasks that track one component. No matching task means nothing tracks it yet: NOT_STARTED. */
function fromTasks(component: ProvComponent, tasks: StandupTask[]): ProvisioningEntry {
  if (tasks.length === 0) return entry(component, 'NOT_STARTED', null, 'no setup task tracks this yet');
  const real = tasks.filter((t) => t.status !== 'na');
  if (real.length === 0) return entry(component, 'COMPLETE', null, 'not applicable for this brand');
  const blocked = real.find((t) => t.status === 'blocked');
  if (blocked) return entry(component, 'BLOCKED', blocked.owner as ProvOwner, blocked.note?.trim() || blocked.task);
  const open = real.filter((t) => t.status !== 'done');
  if (open.length === 0) return entry(component, 'COMPLETE', null, `${real.length} of ${real.length} tasks done`);
  const next = [...open].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || a.stage - b.stage || (a.sort ?? 0) - (b.sort ?? 0))[0];
  const started = open.length < real.length || open.some((t) => t.status === 'doing');
  if (EXTERNAL.includes(next.owner as ProvOwner)) return entry(component, 'WAITING', next.owner as ProvOwner, next.task);
  return entry(component, started ? 'IN_PROGRESS' : 'NOT_STARTED', next.owner as ProvOwner, next.task);
}

const has = (re: RegExp) => (t: StandupTask) => re.test(t.task);
const stage = (n: number) => (t: StandupTask) => t.stage === n;

export function provisioningRecord(f: ProvisioningFacts): ProvisioningRecord {
  const T = f.tasks;
  const pick = (p: (t: StandupTask) => boolean) => T.filter(p);
  const c: ProvisioningEntry[] = [];

  c.push(f.clientName ? entry('client', 'COMPLETE', null, f.clientName) : entry('client', 'NOT_STARTED', 'virat', 'no client recorded'));
  c.push(f.registryStatus ? entry('brand', 'COMPLETE', null, `registered as ${f.registryStatus}`) : entry('brand', 'NOT_STARTED', 'virat', 'no brand record'));
  c.push(f.agreementSigned === true ? entry('agreement', 'COMPLETE', null, 'terms signed')
    : f.agreementSigned === false ? entry('agreement', 'WAITING', 'founder', 'terms not yet signed') : entry('agreement', 'NOT_STARTED', 'virat', 'not recorded'));
  c.push(f.depositPaid === true ? entry('payment', 'COMPLETE', null, 'deposit confirmed')
    : f.depositPaid === false ? entry('payment', 'WAITING', 'founder', 'deposit not yet confirmed') : entry('payment', 'NOT_STARTED', 'virat', 'not recorded'));
  c.push(f.registryStatus ? entry('brand_registry', 'COMPLETE', null, `brands row, status ${f.registryStatus}`) : entry('brand_registry', 'NOT_STARTED', 'virat', 'no brands row'));

  const fnd = f.foundation;
  c.push(fnd === 'committed' ? entry('foundation', 'COMPLETE', null, 'Foundation committed')
    : fnd === 'draft' || fnd === 'review' || fnd === 'approved' ? entry('foundation', 'IN_PROGRESS', 'founder', `Foundation is ${fnd}; downstream work needs it committed`)
    : fnd === 'superseded' ? entry('foundation', 'FAILED', 'virat', 'Foundation superseded with no committed successor') : entry('foundation', 'NOT_STARTED', 'founder', 'no Foundation yet'));

  c.push(fromTasks('repository', pick(has(/github|repo\b/i))));
  c.push(fromTasks('database', pick(has(/supabase/i))));
  c.push(fromTasks('environment', pick(has(/ADMIN_PASSWORD|env\b|environment/i))));
  const dep = fromTasks('deployment', pick(has(/vercel/i)));
  c.push(f.dashboardDeployed === true && dep.state !== 'COMPLETE' ? { ...dep, state: 'COMPLETE', detail: 'dashboard deployment recorded' } : dep);
  c.push(fromTasks('domain', pick(has(/domain|nameserver|dns|registrar/i))));
  c.push(fromTasks('payments', pick(stage(2))));

  const cat = f.approvedProducts;
  c.push(cat && cat > 0 ? entry('catalogue', 'COMPLETE', null, `${cat} approved product${cat === 1 ? '' : 's'}`)
    : entry('catalogue', 'NOT_STARTED', 'founder', 'no approved products yet'));
  const ship = fromTasks('commerce', pick(stage(3)));
  c.push(cat && cat > 0 ? ship : ship.state === 'COMPLETE' ? entry('commerce', 'IN_PROGRESS', null, 'shipping set up; waiting for approved products') : ship);

  c.push(fromTasks('email', pick(stage(4))));
  c.push(fromTasks('whatsapp', pick(stage(5))));
  c.push(fromTasks('analytics', pick((t) => t.stage === 7 || /analytics|search console|pixel/i.test(t.task))));
  c.push(T.length > 0 ? entry('team', 'COMPLETE', null, `${T.length} setup tasks are on the operations tracker`) : entry('team', 'WAITING', 'virat', 'Virat has not assigned the build to the operations team (a deliberate human step)'));
  c.push(f.agentId ? entry('agents', 'COMPLETE', null, `Brand CEO ${f.agentId}`) : entry('agents', 'WAITING', 'virat', 'no Brand CEO registered; Virat approves a new agent'));
  c.push(f.dashboardDeployed === true ? entry('dashboard', 'COMPLETE', null, 'brand plane dashboard deployed')
    : entry('dashboard', f.dashboardDeployed === false ? 'WAITING' : 'NOT_STARTED', 'team', 'brand plane not deployed (needs repository, database and deployment)'));

  c.push(f.health === 'PASS' ? entry('health', 'COMPLETE', null, 'all components PASS')
    : f.health === 'FAIL' ? entry('health', 'FAILED', 'team', 'a health component is failing')
    : f.health === 'WARN' || f.health === 'UNKNOWN' ? entry('health', 'IN_PROGRESS', 'team', `health is ${f.health}, not PASS`) : entry('health', 'NOT_STARTED', 'team', 'no health reading'));

  // Go-live is a human decision recorded in the registry. A stage-9 task that is merely "not applicable" never counts.
  const golive = fromTasks('go_live', pick(stage(9)));
  c.push(f.registryStatus === 'live' ? entry('go_live', 'COMPLETE', null, 'registry status is live (set by a human)')
    : golive.state === 'COMPLETE' ? entry('go_live', 'WAITING', 'virat', 'the registry status is set to live by a human; no go-live task is open') : golive);

  for (const [comp, o] of Object.entries(f.observed ?? {}) as [ProvComponent, { state: ProvState; detail: string }][]) {
    const i = c.findIndex((e) => e.component === comp);
    const owner = o.state === 'COMPLETE' ? null : c[i].owner;
    if (i >= 0) c[i] = entry(comp, o.state, owner, `observed: ${o.detail}`);
  }

  const order = new Map(PROVISIONING_COMPONENTS.map((n, i) => [n, i]));
  c.sort((a, b) => order.get(a.component)! - order.get(b.component)!);

  const blockers = c.filter((e) => e.state === 'BLOCKED' || e.state === 'FAILED');
  const open = c.filter((e) => e.state !== 'COMPLETE');
  const complete = c.length - open.length;
  const overall: ProvState = c.length === complete ? 'COMPLETE' : blockers.some((b) => b.state === 'FAILED') ? 'FAILED' : blockers.length ? 'BLOCKED'
    : complete === 0 && open.every((e) => e.state === 'NOT_STARTED') ? 'NOT_STARTED' : open.every((e) => e.state === 'WAITING') ? 'WAITING' : 'IN_PROGRESS';
  const next = open.find((e) => e.state !== 'WAITING') ?? open[0];

  return {
    brandKey: f.brandKey, workId: f.workId, overall, components: c, complete, total: c.length,
    nextAction: next ? { component: next.component, owner: next.owner, detail: next.detail } : null,
    blockers,
  };
}
