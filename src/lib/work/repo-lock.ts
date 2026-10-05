// Repository locks: how concurrent technical work is controlled.
//
// Before an agent begins MATERIAL repository work (anything that writes), it runs the preflight:
//   1. existing work  2. its accountable owner  3. dependencies  4. repository lock  5. existing PR / branch
// then takes a lock for its item. Two active locks conflict when they share a repository AND any of:
// the same branch, the same worktree, the same deployment target, or overlapping paths. Disjoint
// paths on different branches and worktrees are "explicit separation" and do not conflict.
// Live brand repositories can be made exclusive (one writer at a time, whatever the paths): the
// "one owner per live repo at a time" rule.
//
// Locks expire (a dead agent must not hold a repository forever) and are renewed to keep them.
// Path matching is by segment prefix; globs are not interpreted. An empty path list = whole repository.

import type { Actor, RepoLock, RepoScope, WorkItem, WorkLink } from './types';

export interface LockPolicy {
  /** Repositories where only one active material lock may exist at a time (the live brand repos). */
  exclusiveRepositories: readonly string[];
  /** PROPOSED default, not measured: a lock lasts this long unless renewed. */
  defaultTtlMs: number;
}
export const DEFAULT_LOCK_POLICY: LockPolicy = { exclusiveRepositories: [], defaultTtlMs: 24 * 60 * 60 * 1000 };

const normPath = (p: string): string => p.trim().replace(/^\.\//, '').replace(/\/+$/, '');

export function pathsOverlap(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return true; // whole repository
  for (const x of a.map(normPath)) for (const y of b.map(normPath)) {
    if (x === '' || y === '' || x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`)) return true;
  }
  return false;
}

export interface ScopeLike { repository: string; branch: string | null; worktree: string | null; paths: readonly string[]; deployment_target: string | null }

export function scopesConflict(a: ScopeLike, b: ScopeLike): boolean {
  if (a.repository !== b.repository) return false;
  if (a.branch && a.branch === b.branch) return true;
  if (a.worktree && a.worktree === b.worktree) return true;
  if (a.deployment_target && a.deployment_target === b.deployment_target) return true;
  return pathsOverlap(a.paths, b.paths);
}

export const isLockActive = (l: RepoLock, now: string): boolean => l.released_at === null && Date.parse(l.expires_at) > Date.parse(now);

/** Active locks that stop `req` from writing. `selfWorkId` is excluded (an item does not conflict with itself). */
export function findConflicts(req: ScopeLike, locks: readonly RepoLock[], policy: LockPolicy, now: string, selfWorkId: string | null = null): RepoLock[] {
  const exclusive = policy.exclusiveRepositories.includes(req.repository);
  return locks.filter((l) => isLockActive(l, now) && l.work_id !== selfWorkId && l.repository === req.repository && (exclusive || scopesConflict(req, l)));
}

export interface PreflightReport {
  clear: boolean;
  /** 1. Open work already declaring this repository area, branch or PR. */
  existingWork: { id: string; ref: string; state: string; priority: string | null; owner: Actor | null; branch: string | null; pr: string | null }[];
  /** 2. Their accountable owners (talk to them or attach to their item instead of starting parallel work). */
  owners: Actor[];
  /** 3. Items that must finish before this one (open blockers). */
  openDependencies: string[];
  /** 4. Active locks that conflict. */
  lockConflicts: { lock_id: string; work_id: string; lock_owner: Actor; branch: string | null; paths: string[]; expires_at: string }[];
  /** 5. Items already declaring the same branch or PR. */
  branchOrPr: string[];
  reasons: string[];
}

export function preflight(
  scope: RepoScope,
  selfWorkId: string | null,
  view: { items: readonly WorkItem[]; links: readonly WorkLink[]; locks: readonly RepoLock[] },
  policy: LockPolicy,
  now: string,
): PreflightReport {
  const open = view.items.filter((i) => i.state !== 'closed' && !i.merged_into && i.id !== selfWorkId && i.repo_scope && i.repo_scope.repository === scope.repository);
  const sameArea = open.filter((i) => {
    const s = i.repo_scope!;
    return (scope.branch && s.branch === scope.branch) || (scope.pr && s.pr === scope.pr) || pathsOverlap(scope.paths, s.paths);
  });
  const branchOrPr = sameArea.filter((i) => (scope.branch && i.repo_scope!.branch === scope.branch) || (scope.pr && i.repo_scope!.pr === scope.pr)).map((i) => i.id);
  const byId = new Map(view.items.map((i) => [i.id, i]));
  const openDependencies = selfWorkId
    ? view.links.filter((l) => l.kind === 'blocks' && l.to === selfWorkId && byId.get(l.from) && byId.get(l.from)!.state !== 'closed').map((l) => l.from)
    : [];
  const conflicts = findConflicts(scope, view.locks, policy, now, selfWorkId);
  const owners: Actor[] = [];
  for (const i of sameArea) if (i.owner && !owners.some((o) => o.id === i.owner!.id)) owners.push(i.owner);

  const reasons: string[] = [];
  if (sameArea.length) reasons.push(`${sameArea.length} open item(s) already cover this area: ${sameArea.map((i) => i.ref).join(', ')}. Attach to one instead of starting parallel work.`);
  if (openDependencies.length) reasons.push(`blocked by open item(s): ${openDependencies.join(', ')}`);
  if (conflicts.length) reasons.push(`${conflicts.length} active lock(s) conflict${policy.exclusiveRepositories.includes(scope.repository) ? ' (this repository allows one writer at a time)' : ''}`);

  return {
    clear: sameArea.length === 0 && openDependencies.length === 0 && conflicts.length === 0,
    existingWork: sameArea.map((i) => ({ id: i.id, ref: i.ref, state: i.state, priority: i.priority, owner: i.owner, branch: i.repo_scope!.branch, pr: i.repo_scope!.pr })),
    owners,
    openDependencies,
    lockConflicts: conflicts.map((l) => ({ lock_id: l.id, work_id: l.work_id, lock_owner: l.lock_owner, branch: l.branch, paths: l.paths, expires_at: l.expires_at })),
    branchOrPr,
    reasons,
  };
}
