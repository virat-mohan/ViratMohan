// Parallel work operational: collision detection, ownership visibility, shared progress.
// Reads Work Registry + estate registry to surface conflicts before they happen.
// Pure deterministic logic — no network, no AI.

import type { WorkItem, Actor } from '../work/types';
import type { InMemoryWorkRegistry } from '../work/registry';
import { REPO_ESTATE, repoForBrand, type RepoEntry } from './estate-registry';
import { AGENT_REGISTRY, findAgent } from './types';

export interface CollisionCheck {
  ok: boolean;
  conflicts: Conflict[];
}

export interface Conflict {
  kind: 'repo_overlap' | 'brand_overlap' | 'owner_overload' | 'migration_conflict';
  severity: 'blocking' | 'warning';
  description: string;
  existingWorkId: string | null;
  repo: string | null;
}

export function checkCollisions(
  registry: InMemoryWorkRegistry,
  brandKey: string | null,
  repo: string | null,
  proposedOwner: Actor | null,
): CollisionCheck {
  const openItems = registry.list().filter(i => i.state !== 'closed' && !i.merged_into);
  const conflicts: Conflict[] = [];

  // 1. Repo overlap: another open work item targets the same repo
  if (repo) {
    const repoWork = openItems.filter(i => {
      if (i.scope.brand) {
        const r = repoForBrand(i.scope.brand);
        return r?.slug === repo;
      }
      return false;
    });
    for (const w of repoWork) {
      if (w.state === 'in_progress') {
        conflicts.push({
          kind: 'repo_overlap',
          severity: 'blocking',
          description: `${w.ref} "${w.title}" is in progress on repo ${repo} (owner: ${w.owner?.id ?? 'none'})`,
          existingWorkId: w.id,
          repo,
        });
      }
    }
  }

  // 2. Brand overlap: another open work item on the same brand is in progress
  if (brandKey) {
    const brandWork = openItems.filter(i => i.scope.brand === brandKey && i.state === 'in_progress');
    for (const w of brandWork) {
      conflicts.push({
        kind: 'brand_overlap',
        severity: 'warning',
        description: `${w.ref} "${w.title}" is in progress for brand ${brandKey} (owner: ${w.owner?.id ?? 'none'})`,
        existingWorkId: w.id,
        repo: null,
      });
    }
  }

  // 3. Owner overload: proposed owner already has 5+ open items
  if (proposedOwner) {
    const ownerWork = openItems.filter(i => i.owner?.id === proposedOwner.id);
    if (ownerWork.length >= 5) {
      conflicts.push({
        kind: 'owner_overload',
        severity: 'warning',
        description: `${proposedOwner.id} already owns ${ownerWork.length} open work items`,
        existingWorkId: null,
        repo: null,
      });
    }
  }

  return {
    ok: conflicts.filter(c => c.severity === 'blocking').length === 0,
    conflicts,
  };
}

export interface WorkOwnershipView {
  agentId: string;
  agentName: string;
  role: string;
  openItems: number;
  inProgress: number;
  blocked: number;
  pendingApproval: number;
  brands: string[];
}

export function ownershipSummary(registry: InMemoryWorkRegistry): WorkOwnershipView[] {
  const openItems = registry.list().filter(i => i.state !== 'closed' && !i.merged_into);
  const views: WorkOwnershipView[] = [];

  for (const agent of AGENT_REGISTRY) {
    const owned = openItems.filter(i => i.owner?.id === agent.id);
    if (owned.length === 0) continue;
    const brands = new Set<string>();
    for (const w of owned) if (w.scope.brand) brands.add(w.scope.brand);
    views.push({
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      openItems: owned.length,
      inProgress: owned.filter(i => i.state === 'in_progress').length,
      blocked: owned.filter(i => i.state === 'blocked').length,
      pendingApproval: owned.filter(i => i.state === 'pending_approval').length,
      brands: [...brands],
    });
  }

  return views.sort((a, b) => b.openItems - a.openItems);
}

export interface RepoWorkView {
  repo: RepoEntry;
  openItems: number;
  inProgress: number;
  activeOwners: string[];
}

export function repoWorkStatus(registry: InMemoryWorkRegistry): RepoWorkView[] {
  const openItems = registry.list().filter(i => i.state !== 'closed' && !i.merged_into);
  const views: RepoWorkView[] = [];

  for (const repo of REPO_ESTATE) {
    if (!repo.brand) continue;
    const repoWork = openItems.filter(i => i.scope.brand === repo.brand);
    const owners = new Set<string>();
    for (const w of repoWork) if (w.owner) owners.add(w.owner.id);
    views.push({
      repo,
      openItems: repoWork.length,
      inProgress: repoWork.filter(i => i.state === 'in_progress').length,
      activeOwners: [...owners],
    });
  }

  return views;
}
