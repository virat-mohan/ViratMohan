// An incident is a Work item of type "incident" plus an IncidentRecord. No separate incident system.
// Real numbers only: a measured figure must name its source; "unknown" is a valid, honest answer.

import type { IncidentRecord, Quantified, Result, WorkItem } from './types';
import { fail, ok } from './types';

export const emptyIncident = (): IncidentRecord => ({ diagnosis: null, tests: [], result: null, cost: null, revenue_impact: null, decision: null, prevention: [] });

export function validateQuantified(q: Quantified | null | undefined, label: string): Result<Quantified | null> {
  if (q == null) return ok(null);
  if (!q.unit?.trim()) return fail('invalid_input', `${label}: a unit is required`);
  if (q.basis === 'unknown') {
    if (q.value !== null) return fail('invalid_input', `${label}: an unknown figure must have no value`);
    return ok(q);
  }
  if (typeof q.value !== 'number' || !Number.isFinite(q.value)) return fail('invalid_input', `${label}: a ${q.basis} figure needs a numeric value`);
  if (!q.source?.trim()) return fail('invalid_input', `${label}: a ${q.basis} figure must name its source (real numbers only, each traceable)`);
  return ok(q);
}

const blank = (s: string | null | undefined) => !s || !s.trim();

/** What an incident needs before it can be marked RESOLVED: diagnosed, tested, with a result. */
export function resolveGaps(item: Pick<WorkItem, 'incident'>): string[] {
  const i = item.incident;
  const gaps: string[] = [];
  if (!i || blank(i.diagnosis)) gaps.push('diagnosis');
  if (!i || !i.tests.some((t) => t.result === 'pass')) gaps.push('a passing test');
  if (!i || blank(i.result)) gaps.push('result');
  return gaps;
}

/**
 * What an incident needs before it can be CLOSED. Every incident ends with one lesson ("every fix ends
 * with one lesson", CLAUDE.md). P0 and P1 also need prevention and an explicit cost and revenue
 * impact (a figure with its source, or honestly unknown).
 */
export function closeGaps(item: Pick<WorkItem, 'incident' | 'learning' | 'priority'>): string[] {
  const gaps: string[] = [];
  if (!item.learning || blank(item.learning.lesson)) gaps.push('learning (one lesson)');
  if (item.priority === 'P0' || item.priority === 'P1') {
    const i = item.incident;
    if (!i || i.prevention.length === 0) gaps.push('prevention');
    if (!i || i.cost === null) gaps.push('cost (a figure with its source, or unknown)');
    if (!i || i.revenue_impact === null) gaps.push('revenue impact (a figure with its source, or unknown)');
  }
  return gaps;
}
