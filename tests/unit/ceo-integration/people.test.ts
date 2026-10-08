import { describe, expect, it } from 'vitest';
import {
  PRINCE,
  HUMAN_REGISTRY,
  findWorker,
  workerAsActor,
  workerPerformance,
  peopleSummary,
  type HumanTask,
} from '../../../src/lib/ceo/people';

const NOW = new Date('2026-10-08T10:00:00.000Z');

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

  it('workerPerformance with no tasks returns zeroes', () => {
    const perf = workerPerformance(PRINCE, [], NOW);
    expect(perf.tasks_total).toBe(0);
    expect(perf.tasks_done).toBe(0);
    expect(perf.tasks_overdue).toBe(0);
    expect(perf.avg_completion_hours).toBeNull();
  });

  it('workerPerformance counts done, overdue and blocked tasks', () => {
    const tasks: HumanTask[] = [
      { id: 't1', worker_id: 'P-01', title: 'Setup DNS', objective: 'DNS', priority: 'P1', status: 'done', due_at: '2026-10-07T00:00:00Z', assigned_at: '2026-10-06T00:00:00Z', completed_at: '2026-10-06T12:00:00Z', owner: 'team', work_item_id: null },
      { id: 't2', worker_id: 'P-01', title: 'Webhook', objective: 'WH', priority: 'P2', status: 'in_progress', due_at: '2026-10-07T00:00:00Z', assigned_at: '2026-10-06T00:00:00Z', completed_at: null, owner: 'team', work_item_id: null },
      { id: 't3', worker_id: 'P-01', title: 'Keys', objective: 'K', priority: 'P2', status: 'blocked', due_at: null, assigned_at: '2026-10-06T00:00:00Z', completed_at: null, owner: 'team', work_item_id: null },
    ];
    const perf = workerPerformance(PRINCE, tasks, NOW);
    expect(perf.tasks_total).toBe(3);
    expect(perf.tasks_done).toBe(1);
    expect(perf.tasks_overdue).toBe(1);
    expect(perf.tasks_blocked).toBe(1);
    expect(perf.avg_completion_hours).toBe(12);
  });

  it('peopleSummary returns one row per worker', () => {
    const summary = peopleSummary([], NOW);
    expect(summary).toHaveLength(1);
    expect(summary[0].worker_id).toBe('P-01');
    expect(summary[0].name).toBe('Prince Keshri');
  });
});
