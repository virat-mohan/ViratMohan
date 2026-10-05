// Morning Board: the material-exceptions-only view for Virat + Myoho + DevShop CEO.
// Pure deterministic logic. No AI invocations.

import type { InMemoryWorkRegistry } from '../work/registry';
import type { WorkItem, Priority } from '../work/types';
import type { MorningBoard, MorningBoardItem } from './types';

function isOverdue(item: WorkItem, now: Date): boolean {
  if (!item.deadline) return false;
  return new Date(item.deadline.at) < now && item.state !== 'closed';
}

function daysSince(dateStr: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(dateStr).getTime()) / 86_400_000);
}

export function buildMorningBoard(registry: InMemoryWorkRegistry, now: Date = new Date()): MorningBoard {
  const open = registry.list().filter((i) => i.state !== 'closed');
  const items: MorningBoardItem[] = [];

  // Critical incidents (P0/P1)
  for (const item of open) {
    if (item.priority === 'P0' || item.priority === 'P1') {
      items.push({
        category: 'critical_incident',
        priority: item.priority,
        brand: item.scope.brand,
        title: item.title,
        summary: `${item.ref} ${item.state} — ${item.type}`,
        work_id: item.id,
        action_required: item.state === 'pending_approval' ? 'Approval needed' :
          item.state === 'blocked' ? 'Unblock required' : null,
        evidence_ref: null,
      });
    }
  }

  // Pending approvals
  for (const item of open) {
    if (item.state === 'pending_approval' && item.approval) {
      items.push({
        category: 'decision_required',
        priority: item.priority,
        brand: item.scope.brand,
        title: `Approve: ${item.title}`,
        summary: `${item.ref} — ${item.approval.authority} — ${item.approval.reason}`,
        work_id: item.id,
        action_required: `Decision needed from ${item.approval.requested_from}`,
        evidence_ref: null,
      });
    }
  }

  // Blocked work
  for (const item of open) {
    if (item.state === 'blocked') {
      const staleDays = item.blocked ? daysSince(item.blocked.since, now) : 0;
      if (staleDays >= 1) {
        items.push({
          category: 'blocked_work',
          priority: item.priority,
          brand: item.scope.brand,
          title: item.title,
          summary: `${item.ref} blocked ${staleDays}d — ${item.blocked?.reason ?? 'no reason'}`,
          work_id: item.id,
          action_required: staleDays >= 3 ? 'Escalation needed' : 'Review blocker',
          evidence_ref: null,
        });
      }
    }
  }

  // Overdue work
  for (const item of open) {
    if (isOverdue(item, now)) {
      items.push({
        category: 'overdue_work',
        priority: item.priority,
        brand: item.scope.brand,
        title: item.title,
        summary: `${item.ref} past deadline ${item.deadline!.at}`,
        work_id: item.id,
        action_required: 'Address overdue item',
        evidence_ref: null,
      });
    }
  }

  // Unassigned work past triage
  for (const item of open) {
    if (!item.owner && item.state !== 'new') {
      items.push({
        category: 'unresolved_approval',
        priority: item.priority,
        brand: item.scope.brand,
        title: item.title,
        summary: `${item.ref} ${item.state} but unassigned`,
        work_id: item.id,
        action_required: 'Assign owner',
        evidence_ref: null,
      });
    }
  }

  // Sort: decisions first, then by priority
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
  const categoryOrder: Record<string, number> = {
    decision_required: 0, critical_incident: 1, blocked_work: 2,
    overdue_work: 3, unresolved_approval: 4, cost_anomaly: 5,
    brand_risk: 6, opportunity: 7, proof_result: 8,
  };
  items.sort((a, b) => {
    const ca = categoryOrder[a.category] ?? 99;
    const cb = categoryOrder[b.category] ?? 99;
    if (ca !== cb) return ca - cb;
    return (priorityOrder[a.priority ?? 'P4'] ?? 4) - (priorityOrder[b.priority ?? 'P4'] ?? 4);
  });

  const brandsWithIssues = [...new Set(
    items.filter((i) => i.brand).map((i) => i.brand!)
  )];

  return {
    date: now.toISOString().slice(0, 10),
    items,
    total_open_work: open.length,
    critical_count: items.filter((i) => i.category === 'critical_incident').length,
    blocked_count: items.filter((i) => i.category === 'blocked_work').length,
    pending_approval_count: items.filter((i) => i.category === 'decision_required').length,
    brands_with_issues: brandsWithIssues,
  };
}
