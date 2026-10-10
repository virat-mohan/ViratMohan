// Control Tower view: read-only projection of Work Registry into the operating view.
// No mutations, no AI, no autonomous remediation. Pure deterministic logic.

import type { WorkItem } from '../work/types';
import type { InMemoryWorkRegistry } from '../work/registry';
import {
  CONTROL_TOWER_STAGES, type ControlTowerStage, type ControlTowerView, type WorkSummary,
} from './types';
import type { Priority } from '../work/types';

/**
 * Map a work item's state to the Control Tower stage it is in.
 * The mapping is deterministic: the state tells us where in the pipeline the item sits.
 */
export function stageOf(item: WorkItem): ControlTowerStage {
  switch (item.state) {
    case 'new': return 'detect';
    case 'triaged': return 'classify';
    case 'assigned': return 'prioritise';
    case 'in_progress': return 'track';
    case 'waiting': return 'track';
    case 'blocked': return 'escalate';
    case 'pending_approval': return 'escalate';
    case 'resolved': return 'verify';
    case 'verification': return 'verify';
    case 'closed': return 'learn';
    case 'reopened': return 'detect';
    default: return 'detect';
  }
}

function summarise(item: WorkItem): WorkSummary {
  return {
    id: item.id,
    ref: item.ref,
    title: item.title,
    type: item.type,
    state: item.state,
    priority: item.priority,
    brand: item.scope.brand,
    owner: item.owner,
    created_at: item.created_at,
    updated_at: item.updated_at,
    stage: stageOf(item),
  };
}

/**
 * Build the Control Tower view from a Work Registry. Read-only: no mutations.
 * Filters to open items by default (excludes closed unless includeAll is set).
 */
export function buildControlTowerView(
  registry: InMemoryWorkRegistry,
  opts: { includeAll?: boolean; brandFilter?: string } = {},
): ControlTowerView {
  let items = registry.list();
  if (!opts.includeAll) {
    items = items.filter((i) => i.state !== 'closed');
  }
  if (opts.brandFilter) {
    items = items.filter((i) => i.scope.brand === opts.brandFilter);
  }

  const summaries = items.map(summarise);

  const byStage = Object.fromEntries(
    CONTROL_TOWER_STAGES.map((s) => [s, summaries.filter((w) => w.stage === s)]),
  ) as Record<ControlTowerStage, WorkSummary[]>;

  const priorities: Priority[] = ['P0', 'P1', 'P2', 'P3', 'P4'];
  const byPriority = Object.fromEntries(
    priorities.map((p) => [p, summaries.filter((w) => w.priority === p)]),
  ) as Record<Priority, WorkSummary[]>;

  const brandMap = new Map<string, WorkSummary[]>();
  for (const s of summaries) {
    const key = s.brand ?? '_devshop';
    const list = brandMap.get(key) ?? [];
    list.push(s);
    brandMap.set(key, list);
  }

  return {
    total: summaries.length,
    byStage,
    byPriority,
    byBrand: Object.fromEntries(brandMap),
    unassigned: summaries.filter((s) => !s.owner && s.state !== 'new'),
    blocked: summaries.filter((s) => s.state === 'blocked'),
    pendingApproval: summaries.filter((s) => s.state === 'pending_approval'),
    critical: summaries.filter((s) => s.priority === 'P0' || s.priority === 'P1'),
  };
}

/**
 * Build the Control Tower view for a single brand from the Work Registry.
 * Used by the Brand Dashboard's Command Centre to show work items for that brand.
 */
export function brandWorkView(registry: InMemoryWorkRegistry, brandKey: string): ControlTowerView {
  return buildControlTowerView(registry, { brandFilter: brandKey });
}
