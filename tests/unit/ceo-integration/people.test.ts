import { describe, expect, it } from 'vitest';
import {
  PRINCE,
  HUMAN_REGISTRY,
  findWorker,
  workerAsActor,
  workerPerformance,
  workerWorkView,
  peopleSummary,
} from '../../../src/lib/ceo/people';
import type { WorkItem } from '../../../src/lib/work/types';

const NOW = new Date('2026-10-08T10:00:00.000Z');

function makeItem(overrides: Partial<WorkItem> & { id: string; state: WorkItem['state'] }): WorkItem {
  return {
    ref: 'W-0001',
    level: 'work_item',
    parent_id: null,
    type: 'task',
    title: 'Test task',
    description: '',
    scope: { kind: 'retail_os', brand: null, founder: null, system: null, extension: null },
    source: { channel: 'internal', requester: { kind: 'agent', id: 'ds_02' } },
    priority: 'P2',
    priority_factors: null,
    priority_reason: null,
    held_from: null,
    owner: { kind: 'human', id: 'p_01' },
    supporting: [],
    observers: [],
    created_at: '2026-10-06T00:00:00.000Z',
    updated_at: '2026-10-08T00:00:00.000Z',
    deadline: null,
    customer_impact: null,
    revenue_profit_risk: null,
    security_risk: null,
    evidence: [],
    waiting: null,
    blocked: null,
    approval: null,
    escalations: [],
    repo_scope: null,
    incident: null,
    resolution: null,
    closure: null,
    learning: null,
    closed_at: null,
    reopen_count: 0,
    merged_into: null,
    source_event_ids: [],
    events: [],
    ...overrides,
  };
}

describe('people', () => {
  it('Prince is the first and only worker', () => {
    expect(HUMAN_REGISTRY).toHaveLength(1);
    expect(PRINCE.id).toBe('P-01');
    expect(PRINCE.email_work).toBe('tech@viratmohan.com');
    expect(PRINCE.reports_to).toBe('DS-00');
  });

  it('findWorker returns Prince by id', () => {
    expect(findWorker('P-01')).toBe(PRINCE);
    expect(findWorker('P-99')).toBeUndefined();
  });

  it('workerAsActor produces a valid Actor', () => {
    const actor = workerAsActor(PRINCE);
    expect(actor.kind).toBe('human');
    expect(actor.id).toBe('p_01');
  });

  it('workerPerformance with no items returns zeroes', () => {
    const perf = workerPerformance('P-01', [], NOW);
    expect(perf.tasks_total).toBe(0);
    expect(perf.tasks_done).toBe(0);
    expect(perf.tasks_overdue).toBe(0);
    expect(perf.avg_completion_hours).toBeNull();
    expect(perf.sla_adherence).toBeNull();
  });

  it('workerPerformance counts done, overdue, blocked and in-progress work items', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'w1', state: 'closed', closed_at: '2026-10-06T12:00:00.000Z' }),
      makeItem({ id: 'w2', state: 'in_progress', deadline: { at: '2026-10-07T00:00:00Z', kind: 'target', promised_to: null } }),
      makeItem({ id: 'w3', state: 'blocked', blocked: { reason: 'waiting on keys', since: '2026-10-06T00:00:00Z' } }),
    ];
    const perf = workerPerformance('P-01', items, NOW);
    expect(perf.tasks_total).toBe(3);
    expect(perf.tasks_done).toBe(1);
    expect(perf.tasks_overdue).toBe(1);
    expect(perf.tasks_blocked).toBe(1);
    expect(perf.avg_completion_hours).toBe(12);
  });

  it('workerWorkView categorises items correctly', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'w1', state: 'assigned' }),
      makeItem({ id: 'w2', state: 'in_progress' }),
      makeItem({ id: 'w3', state: 'blocked', blocked: { reason: 'test', since: NOW.toISOString() } }),
      makeItem({ id: 'w4', state: 'pending_approval' }),
      makeItem({ id: 'w5', state: 'closed', closed_at: NOW.toISOString() }),
    ];
    const view = workerWorkView('P-01', items, NOW);
    expect(view.assigned).toHaveLength(1);
    expect(view.in_progress).toHaveLength(1);
    expect(view.blocked).toHaveLength(1);
    expect(view.pending_approval).toHaveLength(1);
    expect(view.completed).toHaveLength(1);
  });

  it('SLA adherence calculates from deadline vs closed_at', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'w1', state: 'closed', deadline: { at: '2026-10-10T00:00:00Z', kind: 'target', promised_to: null }, closed_at: '2026-10-08T00:00:00Z' }),
      makeItem({ id: 'w2', state: 'closed', deadline: { at: '2026-10-05T00:00:00Z', kind: 'target', promised_to: null }, closed_at: '2026-10-08T00:00:00Z' }),
    ];
    const perf = workerPerformance('P-01', items, NOW);
    expect(perf.sla_adherence).toBe(50);
  });

  it('peopleSummary returns one row per worker with work view', () => {
    const summary = peopleSummary([], NOW);
    expect(summary).toHaveLength(1);
    expect(summary[0].worker_id).toBe('P-01');
    expect(summary[0].name).toBe('Prince Keshri');
    expect(summary[0].workView.assigned).toEqual([]);
  });

  it('items owned by other actors are excluded from Prince view', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'w1', state: 'in_progress', owner: { kind: 'agent', id: 'ds_02' } }),
      makeItem({ id: 'w2', state: 'in_progress', owner: { kind: 'human', id: 'p_01' } }),
    ];
    const view = workerWorkView('P-01', items, NOW);
    expect(view.in_progress).toHaveLength(1);
    expect(view.in_progress[0].id).toBe('w2');
  });
});
