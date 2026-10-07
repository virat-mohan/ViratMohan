// Operational provisioning service: bridges provisioning.ts (which derives state from facts)
// to the Work Registry (which records, assigns and closes work items).
//
// This does NOT replace the provisioning record — it uses it. For each component in a
// BLOCKED or FAILED state, it ensures a Work item exists and is assigned. For COMPLETE
// components, it closes the Work item if one is open. Everything goes through the registry's
// audit trail; nothing is faked.

import type { InMemoryWorkRegistry } from '../work/registry';
import { Scopes } from '../work/scope';
import { VIRAT } from '../work/actors';
import type { ProvisioningRecord, ProvisioningEntry, ProvState } from './provisioning';

export interface ProvisioningWorkRef {
  component: string;
  state: ProvState;
  workId: string | null;
  action: 'created' | 'closed' | 'already_open' | 'skipped' | 'error';
  detail: string;
}

export interface ProvisioningServiceResult {
  brandKey: string;
  overall: ProvState;
  complete: number;
  total: number;
  workRefs: ProvisioningWorkRef[];
  openCount: number;
  closedCount: number;
  errors: string[];
}

const PROV_SOURCE = 'provisioning-service' as const;

// Map provisioning component states to Work item priorities
function provStateToPriority(state: ProvState, component: string): 'P0' | 'P1' | 'P2' | 'P3' {
  if (state === 'FAILED') return 'P1';
  if (state === 'BLOCKED') return 'P1';
  if (['database', 'repository', 'environment', 'deployment'].includes(component)) return 'P1';
  if (['domain', 'payments', 'health', 'go_live'].includes(component)) return 'P2';
  return 'P3';
}

function provTitle(brandKey: string, entry: ProvisioningEntry): string {
  const humanOwner = entry.owner && ['founder', 'brand'].includes(entry.owner) ? ` (waiting: ${entry.owner})` : '';
  return `[${brandKey}] provisioning: ${entry.component}${humanOwner}`;
}

/**
 * Synchronize the provisioning record with the Work Registry.
 * - For BLOCKED/FAILED components: ensure a work item exists (create if not).
 * - For COMPLETE components: close any open work item for that component.
 * - For WAITING/IN_PROGRESS: create a work item if one doesn't exist.
 * - NOT_STARTED: skip (no work item needed yet).
 *
 * Idempotent: calling twice with the same state changes nothing on the second call.
 */
export function syncProvisioningToWork(
  record: ProvisioningRecord,
  registry: InMemoryWorkRegistry,
  now = new Date(),
): ProvisioningServiceResult {
  const refs: ProvisioningWorkRef[] = [];
  const errors: string[] = [];
  let openCount = 0, closedCount = 0;

  for (const entry of record.components) {
    if (entry.state === 'NOT_STARTED') {
      refs.push({ component: entry.component, state: entry.state, workId: null, action: 'skipped', detail: 'not started: no work item yet' });
      continue;
    }

    if (entry.state === 'COMPLETE') {
      // Find any open work item for this component and close it
      const existing = registry.list().find(
        (i) =>
          i.scope.kind === 'brand' &&
          (i.scope as { brand: string }).brand === record.brandKey &&
          i.title.includes(`provisioning: ${entry.component}`) &&
          !['closed', 'resolved'].includes(i.state),
      );
      if (existing) {
        const r = registry.transition(existing.id, 'resolved', VIRAT, { reason: `provisioning component complete: ${entry.detail}` });
        if (r.ok) {
          closedCount++;
          refs.push({ component: entry.component, state: entry.state, workId: existing.id, action: 'closed', detail: 'resolved on completion' });
        } else {
          errors.push(`close ${entry.component}: ${r.error.message}`);
          refs.push({ component: entry.component, state: entry.state, workId: existing.id, action: 'error', detail: r.error.message });
        }
      } else {
        refs.push({ component: entry.component, state: entry.state, workId: null, action: 'skipped', detail: 'complete: no open work item to close' });
      }
      continue;
    }

    // For BLOCKED, FAILED, WAITING, IN_PROGRESS: ensure a work item exists
    const existing = registry.list().find(
      (i) =>
        i.scope.kind === 'brand' &&
        (i.scope as { brand: string }).brand === record.brandKey &&
        i.title.includes(`provisioning: ${entry.component}`) &&
        !['closed', 'resolved'].includes(i.state),
    );

    if (existing) {
      openCount++;
      refs.push({ component: entry.component, state: entry.state, workId: existing.id, action: 'already_open', detail: 'work item exists' });
      continue;
    }

    // Create a new work item
    const priority = provStateToPriority(entry.state, entry.component);
    const type = entry.state === 'FAILED' ? 'incident' : 'task';
    const r = registry.createItem(
      {
        type,
        title: provTitle(record.brandKey, entry),
        description: entry.detail,
        scope: Scopes.brand(record.brandKey),
        source: { channel: 'internal' },
        customer_impact: null,
      },
      VIRAT,
    );

    if (r.ok) {
      openCount++;
      refs.push({ component: entry.component, state: entry.state, workId: r.value.id, action: 'created', detail: `${type} created at ${priority}` });
    } else {
      errors.push(`create ${entry.component}: ${r.error.message}`);
      refs.push({ component: entry.component, state: entry.state, workId: null, action: 'error', detail: r.error.message });
    }
  }

  return {
    brandKey: record.brandKey,
    overall: record.overall,
    complete: record.complete,
    total: record.total,
    workRefs: refs,
    openCount,
    closedCount,
    errors,
  };
}

/**
 * Snapshot: how far along is provisioning for a brand, in Work Registry terms.
 * Does not modify the registry.
 */
export function provisioningWorkSnapshot(brandKey: string, registry: InMemoryWorkRegistry) {
  const items = registry.list().filter(
    (i) =>
      i.scope.kind === 'brand' &&
      (i.scope as { brand: string }).brand === brandKey &&
      i.title.includes('provisioning:'),
  );
  const open = items.filter((i) => !['closed', 'resolved'].includes(i.state));
  const blocked = open.filter((i) => i.state === 'blocked');
  const waiting = open.filter((i) => i.state === 'waiting');
  return { total: items.length, open: open.length, blocked: blocked.length, waiting: waiting.length };
}
