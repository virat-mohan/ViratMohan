// Live health-check runner: the bridge from scripts/health/check.mjs output to the Work Registry.
//
// Single-writer, idempotent, fail-safe. It takes a completed health run (the JSON that check.mjs
// prints), feeds every failure through the existing health-ingest adapter into the DB-backed registry
// via withRegistry (load → ingest → persist). It does NOT: run the health check, remediate failures,
// assign agents, send notifications, deploy, restart services, or auto-close work items.

import type { WorkStore } from './db-store';
import type { HealthRun, HealthIngestOptions, HealthIngestOutcome } from './health-ingest';
import { ingestHealthRun } from './health-ingest';
import { withRegistry } from './db-registry';
import type { Result } from './types';

/** Known health-check brand names → Work Registry brand keys. Control-plane = null. */
const DEFAULT_BRAND_MAP: Record<string, string | null> = {
  viratmohan: null,
  moonglasses: 'moonglasses',
  travaholic: 'caps',                 // the registry key for Travaholic Caps (brands.key)
  ceremony: 'ceremonykitchen',        // the registry key for Ceremony Kitchen (brands.key)
};

export interface HealthRunnerOptions {
  brandMap?: Record<string, string | null>;
  typeHint?: HealthIngestOptions['typeHint'];
}

export interface HealthRunnerResult {
  ok: boolean;
  outcome?: HealthIngestOutcome;
  error?: string;
}

/**
 * Ingest one health run into the Work Registry. Idempotent: re-running the same health report
 * produces no new work items or events. Fail-safe: returns an error result, never throws past
 * the caller boundary (store errors are caught and wrapped).
 */
export async function runHealthIngestion(
  store: WorkStore,
  run: HealthRun,
  opts: HealthRunnerOptions = {},
): Promise<HealthRunnerResult> {
  const brandMap = opts.brandMap ?? DEFAULT_BRAND_MAP;
  const resolveBrand = (name: string): string | null => {
    if (name in brandMap) return brandMap[name];
    return undefined as unknown as string | null; // unknown brand — will be caught below
  };

  // Validate brand resolution before touching the DB
  if (run && Array.isArray(run.report)) {
    for (const b of run.report) {
      if (!b || typeof b.brand !== 'string') continue;
      const hasFailures = Array.isArray(b.results) && b.results.some((r: { ok?: boolean }) => r && !r.ok);
      if (hasFailures && !(b.brand in brandMap)) {
        return { ok: false, error: `unknown brand "${b.brand}" has failures — cannot safely attribute work items` };
      }
    }
  }

  try {
    const ingestOpts: HealthIngestOptions = {
      resolveBrand,
      typeHint: opts.typeHint,
    };

    const result: Result<HealthIngestOutcome> = await withRegistry(store, (reg) =>
      ingestHealthRun(reg, run, ingestOpts),
    );

    if (!result.ok) {
      return { ok: false, error: `${result.error.code}: ${result.error.message}` };
    }
    return { ok: true, outcome: result.value };
  } catch (err) {
    return { ok: false, error: `store error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
