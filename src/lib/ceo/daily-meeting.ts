// Daily CEO Meeting: structured daily operating report for the founder.
// YESTERDAY / TODAY / NEEDS_VIRAT / CEO_RECOMMENDATION / COMMITMENTS / BRANDS / RESULTS
// Pure deterministic logic. No AI invocations.

import type { InMemoryWorkRegistry } from '../work/registry';
import type { WorkItem } from '../work/types';
import { AGENT_REGISTRY, brandCeoFor, type AgentEntry } from './types';
import { buildMorningBoard } from './morning-board';

export interface DailyMeetingBrandStatus {
  brandKey: string;
  agentId: string;
  agentName: string;
  openWork: number;
  critical: number;
  blocked: number;
  resolvedYesterday: number;
}

export interface DailyMeetingItem {
  ref: string;
  title: string;
  state: string;
  priority: string | null;
  brand: string | null;
  owner: string | null;
}

export interface DailyMeeting {
  date: string;
  yesterday: DailyMeetingItem[];
  today: DailyMeetingItem[];
  needsVirat: DailyMeetingItem[];
  ceoRecommendation: string[];
  commitments: string[];
  brands: DailyMeetingBrandStatus[];
  results: { totalOpen: number; resolvedYesterday: number; createdYesterday: number; closedYesterday: number };
}

function toItem(w: WorkItem): DailyMeetingItem {
  return { ref: w.ref, title: w.title, state: w.state, priority: w.priority, brand: w.scope.brand, owner: w.owner?.id ?? null };
}

function isYesterday(isoDate: string, now: Date): boolean {
  const d = new Date(isoDate);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return d.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

function isToday(isoDate: string, now: Date): boolean {
  return new Date(isoDate).toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

const BRAND_KEYS = ['moonglasses', 'caps', 'ceremonykitchen', 'freshforpaws', 'korbi'];

export function buildDailyMeeting(registry: InMemoryWorkRegistry, now: Date = new Date()): DailyMeeting {
  const all = registry.list();
  const open = all.filter((i) => i.state !== 'closed');

  const yesterday = all.filter((i) =>
    i.events.some((e) => e.kind === 'state_change' && isYesterday(e.at, now)),
  ).map(toItem);

  const today = open.filter((i) => {
    if (i.state === 'in_progress') return true;
    if (i.deadline && isToday(i.deadline.at, now)) return true;
    return false;
  }).map(toItem);

  const needsVirat = open.filter((i) =>
    i.state === 'pending_approval' ||
    (i.state === 'blocked' && i.blocked?.reason?.toLowerCase().includes('virat')) ||
    (i.state === 'blocked' && i.blocked?.reason?.toLowerCase().includes('founder')),
  ).map(toItem);

  const board = buildMorningBoard(registry, now);
  const recommendations: string[] = [];
  if (board.critical_count > 0) recommendations.push(`${board.critical_count} critical item(s) need immediate attention`);
  if (board.blocked_count > 0) recommendations.push(`${board.blocked_count} blocked item(s) need unblocking`);
  if (board.pending_approval_count > 0) recommendations.push(`${board.pending_approval_count} decision(s) waiting for approval`);
  if (recommendations.length === 0) recommendations.push('No material exceptions. Operating normally.');

  const commitments: string[] = [];
  for (const item of open) {
    if (item.state === 'in_progress' && item.deadline) {
      commitments.push(`${item.ref}: ${item.title} — due ${item.deadline.at.slice(0, 10)}`);
    }
  }

  const resolvedYesterday = all.filter((i) =>
    i.state === 'resolved' && i.events.some((e) => e.kind === 'state_change' && e.to === 'resolved' && isYesterday(e.at, now)),
  ).length;
  const createdYesterday = all.filter((i) => isYesterday(i.created_at, now)).length;
  const closedYesterday = all.filter((i) => i.closed_at && isYesterday(i.closed_at, now)).length;

  const brands: DailyMeetingBrandStatus[] = BRAND_KEYS.map((key) => {
    const agent = brandCeoFor(key);
    const brandWork = all.filter((i) => i.scope.brand === key);
    const brandOpen = brandWork.filter((i) => i.state !== 'closed');
    return {
      brandKey: key,
      agentId: agent?.id ?? '—',
      agentName: agent?.name ?? '—',
      openWork: brandOpen.length,
      critical: brandOpen.filter((i) => i.priority === 'P0' || i.priority === 'P1').length,
      blocked: brandOpen.filter((i) => i.state === 'blocked').length,
      resolvedYesterday: brandWork.filter((i) =>
        i.events.some((e) => e.kind === 'state_change' && e.to === 'resolved' && isYesterday(e.at, now)),
      ).length,
    };
  });

  return {
    date: now.toISOString().slice(0, 10),
    yesterday,
    today,
    needsVirat,
    ceoRecommendation: recommendations,
    commitments,
    brands,
    results: { totalOpen: open.length, resolvedYesterday, createdYesterday, closedYesterday },
  };
}
