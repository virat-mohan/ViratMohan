// The ONE source adapter: existing health-check failures → Work Registry source events.
//
// Pure and read-only with respect to everything it monitors. It takes a health-check report that
// `scripts/health/check.mjs` ALREADY produced (it does not run the check, fetch anything, or touch a
// brand), and turns each FAILING check into a source event via the registry's own deduplication. It
// never assigns an owner, never changes work state beyond ingestion, never remediates, deploys or
// sends anything. A failing check becomes a NEW work item awaiting triage; a still-failing check on
// the next run attaches to the same open item (same fingerprint); a recovered check simply stops
// producing events (the open item is left for a person to resolve — the adapter never auto-closes).

import type { InMemoryWorkRegistry, IngestResult } from './registry';
import type { Result, WorkType } from './types';
import { fail, ok } from './types';

/** The shape `scripts/health/check.mjs` prints (and stores in health_runs.report). */
export interface HealthResult { check: string; ok: boolean; detail?: string; slow?: boolean }
export interface HealthBrandReport { brand: string; base?: string; failed: number; results: HealthResult[] }
export interface HealthRun { at: string; report: HealthBrandReport[] }

/**
 * Map a health-check brand name to a Work Registry scope. The control-plane site itself
 * (e.g. "viratmohan") is not a brand: it becomes DevShop-scoped work (brand = null). A name that is a
 * real brand key stays a brand. The caller supplies the map; unknown names default to DevShop scope,
 * never to a guessed brand.
 */
export type BrandResolver = (healthName: string) => string | null;

export interface HealthIngestOptions {
  /** Health-check name → registry brand key, or null for control-plane/DevShop scope. */
  resolveBrand?: BrandResolver;
  /** A failing health check is an operational failure: an incident by default. */
  typeHint?: WorkType;
}

export interface HealthIngestOutcome {
  run_at: string;
  failing_checks: number;
  created: number;
  attached: number;
  duplicate: number;
  possible_regression: number;
  events: { brand: string; check: string; outcome: IngestResult['outcome']; work_ref: string }[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Ingest one health run. Idempotent: re-ingesting the same run creates nothing (same channel+ref);
 * a check still failing on a later run attaches to the open item (same fingerprint); a check that was
 * failing on a now-closed item is flagged as a possible regression, never silently reopened.
 */
export function ingestHealthRun(reg: InMemoryWorkRegistry, run: HealthRun, opts: HealthIngestOptions = {}): Result<HealthIngestOutcome> {
  if (!run || typeof run.at !== 'string' || !run.at.trim() || Number.isNaN(Date.parse(run.at))) return fail('invalid_input', 'health run needs an ISO `at` timestamp');
  if (!Array.isArray(run.report)) return fail('invalid_input', 'health run needs a `report` array');
  const resolve = opts.resolveBrand ?? (() => null);
  const typeHint = opts.typeHint ?? 'incident';
  const out: HealthIngestOutcome = { run_at: run.at, failing_checks: 0, created: 0, attached: 0, duplicate: 0, possible_regression: 0, events: [] };

  for (const b of run.report) {
    if (!b || typeof b.brand !== 'string' || !b.brand.trim() || !Array.isArray(b.results)) return fail('invalid_input', 'each brand report needs a brand name and a results array');
    const brandKey = resolve(b.brand);
    for (const r of b.results) {
      if (!r || typeof r.check !== 'string' || typeof r.ok !== 'boolean') return fail('invalid_input', `malformed health result in "${b.brand}"`);
      if (r.ok) continue; // only failures become work
      out.failing_checks++;
      const where = brandKey ?? b.brand;
      const res = reg.ingestSourceEvent({
        channel: 'system_alert',
        external_ref: `health:${run.at}:${slug(b.brand)}:${slug(r.check)}`, // one run + one check = one event (idempotent)
        fingerprint: `health:${slug(b.brand)}:${slug(r.check)}`,            // same check across runs = one issue
        received_at: run.at,
        reporter: { kind: 'system', id: 'system:health-check' },
        brand: brandKey,
        title: `Health check failing: ${r.check} (${where})`,
        summary: (r.detail ?? '').trim() || `The health check "${r.check}" failed for ${where}.`,
        type_hint: typeHint,
      });
      if (!res.ok) return res;
      const o = res.value.outcome;
      if (o === 'created') out.created++;
      else if (o === 'attached') out.attached++;
      else if (o === 'duplicate_event') out.duplicate++;
      else if (o === 'possible_duplicate') out.possible_regression++;
      out.events.push({ brand: b.brand, check: r.check, outcome: o, work_ref: res.value.item.ref });
    }
  }
  return ok(out);
}
