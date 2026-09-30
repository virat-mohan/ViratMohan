// Stage 5B — brand stand-up as a tracked, deterministic lifecycle over the EXISTING ops tasks
// (retail_os_ops_tasks, seeded by ops-seed.ts) and the EXISTING brands registry. No new tables,
// no change to the separate-environment model: this only reads what is already there and rolls it
// up so an operator can answer "where is this stand-up, what's blocking it, who's next, is the
// environment verified?" without reading 17 rows by hand.
//
// The stand-up status is computed deterministically from task stages/statuses. It is NEVER an LLM
// decision, and this module NEVER marks a task complete — human-owned steps (owner 'founder'/'brand')
// stay exactly as the team set them. Go-live to LIVE is a human decision (the brands registry), not
// something this rollup flips.

// Stage numbers come from ops-seed.ts BRAND_SETUP_TASKS:
//   0 Prerequisites · 1 Foundations (Supabase/repo/Vercel/DNS) · 2-7 Payments…Ads (config+integrations)
//   8 Admin · 9 Handover (go-live review + go-live note)
export const INFRA_MAX_STAGE = 1;   // <=1 is infrastructure/provisioning
export const HANDOVER_STAGE = 9;    // only go-live steps remain

export type StandupTask = { stage: number; status: string; owner: string; task: string; note?: string | null; priority?: number | null; sort?: number | null };

export type StandupStatus =
  | 'NOT_STARTED' | 'PROVISIONING' | 'CONFIGURATION_REQUIRED'
  | 'VERIFICATION_REQUIRED' | 'READY_FOR_GO_LIVE' | 'LIVE' | 'BLOCKED';

export type NextAction = { task: string; owner: string } | null;
export type Blocker = { task: string; owner: string; reason: string } | null;

export type Standup = {
  status: StandupStatus;
  total: number;
  done: number;
  open: number;
  blockedCount: number;
  nextAction: NextAction;   // who owns the next action
  blocker: Blocker;         // what is blocking it, if anything
  envVerified: boolean | null; // deterministic environment check result; null = not run
};

const isOpen = (t: StandupTask) => t.status === 'todo' || t.status === 'doing';
const isBlocked = (t: StandupTask) => t.status === 'blocked';
const counts = (t: StandupTask) => t.status !== 'na';

/** Lowest-numbered stage that still has an open (todo/doing) task, or null if none are open. */
export function minOpenStage(tasks: StandupTask[]): number | null {
  const open = tasks.filter(isOpen);
  return open.length ? Math.min(...open.map((t) => t.stage)) : null;
}

/** The single next action: lowest priority number, then lowest stage, then sort. Human-owned steps included. */
export function nextAction(tasks: StandupTask[]): NextAction {
  const open = tasks.filter(isOpen).sort((a, b) =>
    (a.priority ?? 2) - (b.priority ?? 2) || a.stage - b.stage || (a.sort ?? 0) - (b.sort ?? 0));
  return open.length ? { task: open[0].task, owner: open[0].owner } : null;
}

/**
 * Deterministic stand-up rollup. `brandLive` comes from the brands registry (human-set), `envVerified`
 * from a real connectivity check (verifyBrandEnvironment) — null when it has not been run.
 */
export function computeStandup(tasks: StandupTask[], brandLive: boolean, envVerified: boolean | null = null): Standup {
  const counted = tasks.filter(counts);
  const total = counted.length;
  const done = counted.filter((t) => t.status === 'done').length;
  const open = counted.filter(isOpen).length;
  const blockedList = tasks.filter(isBlocked);
  const base = { total, done, open, blockedCount: blockedList.length, nextAction: nextAction(tasks), envVerified };

  if (total === 0) return { ...base, status: 'NOT_STARTED', blocker: null };

  if (blockedList.length) {
    const b = blockedList.sort((a, b) => a.stage - b.stage)[0];
    return { ...base, status: 'BLOCKED', blocker: { task: b.task, owner: b.owner, reason: b.note?.trim() || 'Marked blocked' } };
  }

  const minStage = minOpenStage(tasks);

  // Nothing open: either genuinely live (human flipped the registry) or all steps done awaiting go-live.
  if (minStage === null) {
    return { ...base, status: brandLive ? 'LIVE' : 'READY_FOR_GO_LIVE', blocker: null };
  }

  if (minStage <= INFRA_MAX_STAGE) return { ...base, status: 'PROVISIONING', blocker: null };
  if (minStage < HANDOVER_STAGE) return { ...base, status: 'CONFIGURATION_REQUIRED', blocker: null };

  // Only go-live steps remain: verify the environment first, then it's ready for human go-live approval.
  return { ...base, status: envVerified === true ? 'READY_FOR_GO_LIVE' : 'VERIFICATION_REQUIRED', blocker: null };
}

// ── Deterministic environment verification ─────────────────────────────────────────────────────────
// Reuses the existing per-brand connectivity check (checkBrandConnection): one cheap read against the
// brand's own Supabase project. Pass/fail is deterministic — never an LLM, never "looks healthy".

export type EnvCheck = { key: string; name: string; ok: boolean; message: string; ms: number; urlRef: string };
export type VerifyResult =
  | { found: false; reason: 'not_configured' }
  | { found: true; check: EnvCheck };

export type VerifyDeps = {
  listBrands: () => { key: string; name: string; supabaseUrl: string; serviceKey: string }[];
  check: (brand: { key: string; name: string; supabaseUrl: string; serviceKey: string }) => Promise<EnvCheck>;
};

/** Verify a brand's separate environment actually responds. Fails closed: an unconfigured brand is not "ok". */
export async function verifyBrandEnvironment(brandKey: string, deps: VerifyDeps): Promise<VerifyResult> {
  const brand = deps.listBrands().find((b) => b.key === brandKey);
  if (!brand) return { found: false, reason: 'not_configured' };
  const check = await deps.check(brand);
  return { found: true, check };
}

/** Audit line for an environment verification. Contains only the project ref and result — never a key. */
export function verificationAuditBody(r: VerifyResult, brandKey: string): string {
  if (!r.found) return `env verification: brand "${brandKey}" not configured in RETAIL_OS_LIVE_BRANDS (fail closed)`;
  const c = r.check;
  return `env verification: ${c.ok ? 'PASS' : 'FAIL'} for "${c.key}" (project ${c.urlRef}, ${c.ms}ms)${c.ok ? '' : ` — ${c.message}`}`.slice(0, 500);
}
