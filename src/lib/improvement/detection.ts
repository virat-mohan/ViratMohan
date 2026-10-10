// Improvement detection — recurrence, root cause, signal classification.
// Pure contract: no framework, no network.

import type { RecurrenceRecord, RootCause, ImprovementSignalSource, ImprovementCategory } from './types';
import type { WorkItem, IncidentRecord } from '../work/types';

// ── Recurrence detection ────────────────────────────────────────────────

export interface RecurrenceInput {
  brand: string | null;
  fingerprint: string | null;
  work_ids: string[];
  timestamps: string[];
}

export const RECURRENCE_THRESHOLD = 2;

export function detectRecurrence(input: RecurrenceInput): RecurrenceRecord | null {
  if (input.work_ids.length < RECURRENCE_THRESHOLD) return null;

  const sorted = [...input.timestamps].sort();
  const first_seen = sorted[0];
  const last_seen = sorted[sorted.length - 1];

  let interval_days_avg: number | null = null;
  if (sorted.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / (1000 * 60 * 60 * 24);
      intervals.push(diff);
    }
    interval_days_avg = Math.round((intervals.reduce((s, d) => s + d, 0) / intervals.length) * 10) / 10;
  }

  return {
    pattern: input.fingerprint ?? `brand:${input.brand ?? 'unknown'}`,
    occurrences: input.work_ids.length,
    first_seen,
    last_seen,
    work_ids: input.work_ids,
    interval_days_avg,
  };
}

// ── Root cause validation ───────────────────────────────────────────────

export function validateRootCause(rc: RootCause): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!rc.summary.trim()) missing.push('summary');
  if (rc.depth < 1) missing.push('depth (must be >= 1)');
  if (!rc.evidence_ids.length) missing.push('evidence_ids');
  return { valid: missing.length === 0, missing };
}

// ── Signal classification ───────────────────────────────────────────────

export function classifySignalSource(item: WorkItem): ImprovementSignalSource {
  if (item.type === 'incident' && item.incident) return 'incident';
  if (item.type === 'alert') return 'health_check';
  if (item.type === 'support') return 'customer_feedback';
  if (item.source.channel === 'agent_detection') return 'agent_detection';
  return 'human_observation';
}

export function classifyImprovementCategory(description: string): ImprovementCategory {
  const lower = description.toLowerCase();
  if (/\b(brand\s+book|brand\s+voice|brand\s+drift|brand\s+identity)\b/.test(lower)) return 'brand';
  if (/\b(visual|design|logo|image|creative|ui|ux)\b/.test(lower)) return 'visual';
  if (/\b(model|routing|intelligence|llm|ai\s+quality)\b/.test(lower)) return 'model';
  if (/\b(security|auth|permission|access|vulnerability)\b/.test(lower)) return 'security';
  if (/\b(agent|coordinator|ceo\s+agent|brand\s+ceo)\b/.test(lower)) return 'agent';
  if (/\b(platform|dashboard|admin|retail.os)\b/.test(lower)) return 'platform';
  if (/\b(integration|api|webhook|connect)\b/.test(lower)) return 'integration';
  return 'process';
}

// ── Improvement from incident (detect signal) ───────────────────────────

export function shouldCreateImprovement(item: WorkItem): boolean {
  if (item.type !== 'incident') return false;
  if (!item.incident) return false;
  if (!item.learning) return false;
  if (item.learning.rule_added) return true;
  if (item.incident.prevention.length > 0) return true;
  return false;
}
