// People OS: human worker registry, work tracking via the Work Registry, TAT/SLA and performance.
// Prince is the first worker. CEO coordinates humans alongside agents.
// Pure deterministic logic, no AI, no network.
//
// Database: migrations/0057_agent_training_people.sql (human_workers table).
// Work tracking uses the existing Work Registry, NOT a separate task table.
// A human's assigned work = registry items where owner_kind='human' AND owner_id matches.

import type { Actor, WorkItem } from '../work/types';

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

export interface WorkerWorkView {
  assigned: WorkItem[];
  in_progress: WorkItem[];
  due_today: WorkItem[];
  overdue: WorkItem[];
  blocked: WorkItem[];
  waiting: WorkItem[];
  pending_approval: WorkItem[];
  completed: WorkItem[];
}

export interface WorkerPerformance {
  worker_id: string;
  tasks_total: number;
  tasks_done: number;
  tasks_overdue: number;
  tasks_blocked: number;
  tasks_waiting: number;
  tasks_in_progress: number;
  avg_completion_hours: number | null;
  sla_adherence: number | null;
}

// ── Persistence interface ────────────────────────────────────────────────────

export interface PeopleStore {
  loadWorker(id: string): Promise<HumanWorker | null>;
  loadAllWorkers(): Promise<HumanWorker[]>;
  saveWorker(worker: HumanWorker): Promise<void>;
}

// ── Worker registry ──────────────────────────────────────────────────────────

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

// ── Work view from Work Registry items ───────────────────────────────────────

function isOwnedBy(item: WorkItem, workerId: string): boolean {
  const actorId = workerId.toLowerCase().replace('-', '_');
  return item.owner?.kind === 'human' && item.owner.id === actorId;
}

function isDueToday(item: WorkItem, now: Date): boolean {
  if (!item.deadline?.at) return false;
  const target = new Date(item.deadline.at);
  return target.toDateString() === now.toDateString();
}

function isOverdue(item: WorkItem, now: Date): boolean {
  if (!item.deadline?.at) return false;
  const target = new Date(item.deadline.at);
  const closed = ['resolved', 'verification', 'closed'];
  return target < now && !closed.includes(item.state);
}

export function workerWorkView(workerId: string, items: WorkItem[], now: Date = new Date()): WorkerWorkView {
  const mine = items.filter((i) => isOwnedBy(i, workerId));
  return {
    assigned: mine.filter((i) => i.state === 'new' || i.state === 'triaged' || i.state === 'assigned'),
    in_progress: mine.filter((i) => i.state === 'in_progress'),
    due_today: mine.filter((i) => isDueToday(i, now) && !['resolved', 'verification', 'closed'].includes(i.state)),
    overdue: mine.filter((i) => isOverdue(i, now)),
    blocked: mine.filter((i) => i.state === 'blocked'),
    waiting: mine.filter((i) => i.state === 'waiting'),
    pending_approval: mine.filter((i) => i.state === 'pending_approval'),
    completed: mine.filter((i) => ['resolved', 'verification', 'closed'].includes(i.state)),
  };
}

// ── Performance from Work Registry ───────────────────────────────────────────

export function workerPerformance(workerId: string, items: WorkItem[], now: Date = new Date()): WorkerPerformance {
  const mine = items.filter((i) => isOwnedBy(i, workerId));
  const done = mine.filter((i) => ['resolved', 'verification', 'closed'].includes(i.state));
  const overdue = mine.filter((i) => isOverdue(i, now));
  const blocked = mine.filter((i) => i.state === 'blocked');
  const waiting = mine.filter((i) => i.state === 'waiting');
  const inProgress = mine.filter((i) => i.state === 'in_progress');

  let avgHours: number | null = null;
  if (done.length > 0) {
    const withClosedAt = done.filter((i) => i.closed_at);
    if (withClosedAt.length > 0) {
      const totalMs = withClosedAt.reduce((sum, i) => {
        return sum + (new Date(i.closed_at!).getTime() - new Date(i.created_at).getTime());
      }, 0);
      avgHours = Math.round((totalMs / withClosedAt.length / 3_600_000) * 10) / 10;
    }
  }

  const withDeadline = done.filter((i) => i.deadline?.at && i.closed_at);
  let slaAdherence: number | null = null;
  if (withDeadline.length > 0) {
    const onTime = withDeadline.filter((i) => new Date(i.closed_at!) <= new Date(i.deadline!.at));
    slaAdherence = Math.round((onTime.length / withDeadline.length) * 100);
  }

  return {
    worker_id: workerId,
    tasks_total: mine.length,
    tasks_done: done.length,
    tasks_overdue: overdue.length,
    tasks_blocked: blocked.length,
    tasks_waiting: waiting.length,
    tasks_in_progress: inProgress.length,
    avg_completion_hours: avgHours,
    sla_adherence: slaAdherence,
  };
}

export function peopleSummary(items: WorkItem[], now: Date = new Date()): Array<{
  worker_id: string;
  name: string;
  role: string;
  active: boolean;
  performance: WorkerPerformance;
  workView: WorkerWorkView;
}> {
  return HUMAN_REGISTRY.map((w) => ({
    worker_id: w.id,
    name: w.name,
    role: w.role,
    active: w.active,
    performance: workerPerformance(w.id, items, now),
    workView: workerWorkView(w.id, items, now),
  }));
}
