// People OS: human worker registry, task tracking, TAT/SLA and performance.
// Prince is the first worker. CEO coordinates humans alongside agents.
// Pure deterministic logic, no AI, no network.

import type { Actor } from '../work/types';

export interface HumanWorker {
  id: string;
  name: string;
  email_work: string;
  email_personal: string | null;
  whatsapp: string;
  role: string;
  scope: string;
  reports_to: string;
  started_at: string;
  active: boolean;
}

export interface HumanTask {
  id: string;
  worker_id: string;
  title: string;
  objective: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
  due_at: string | null;
  assigned_at: string;
  completed_at: string | null;
  owner: 'team' | 'virat';
  work_item_id: string | null;
}

export interface WorkerPerformance {
  worker_id: string;
  tasks_total: number;
  tasks_done: number;
  tasks_overdue: number;
  tasks_blocked: number;
  avg_completion_hours: number | null;
}

export const PRINCE: HumanWorker = {
  id: 'P-01',
  name: 'Prince Keshri',
  email_work: 'tech@viratmohan.com',
  email_personal: 'pr.prince.3068@gmail.com',
  whatsapp: '+919140067354',
  role: 'Retail OS Operations',
  scope: 'brand onboarding, integrations, accounts, keys, webhooks, templates, DNS, deploys, setup records',
  reports_to: 'DS-00',
  started_at: '2026-01-01T00:00:00.000Z',
  active: true,
};

export const HUMAN_REGISTRY: HumanWorker[] = [PRINCE];

export function findWorker(id: string): HumanWorker | undefined {
  return HUMAN_REGISTRY.find((w) => w.id === id);
}

export function workerAsActor(worker: HumanWorker): Actor {
  return { kind: 'human', id: worker.id.toLowerCase().replace('-', '_') };
}

export function workerPerformance(worker: HumanWorker, tasks: HumanTask[], now: Date = new Date()): WorkerPerformance {
  const mine = tasks.filter((t) => t.worker_id === worker.id);
  const done = mine.filter((t) => t.status === 'done');
  const overdue = mine.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && t.due_at && new Date(t.due_at) < now);
  const blocked = mine.filter((t) => t.status === 'blocked');

  let avgHours: number | null = null;
  if (done.length > 0) {
    const totalMs = done.reduce((sum, t) => {
      if (!t.completed_at) return sum;
      return sum + (new Date(t.completed_at).getTime() - new Date(t.assigned_at).getTime());
    }, 0);
    avgHours = Math.round((totalMs / done.length / 3_600_000) * 10) / 10;
  }

  return {
    worker_id: worker.id,
    tasks_total: mine.length,
    tasks_done: done.length,
    tasks_overdue: overdue.length,
    tasks_blocked: blocked.length,
    avg_completion_hours: avgHours,
  };
}

export function peopleSummary(tasks: HumanTask[], now: Date = new Date()): Array<{
  worker_id: string;
  name: string;
  role: string;
  active: boolean;
  performance: WorkerPerformance;
}> {
  return HUMAN_REGISTRY.map((w) => ({
    worker_id: w.id,
    name: w.name,
    role: w.role,
    active: w.active,
    performance: workerPerformance(w, tasks, now),
  }));
}
