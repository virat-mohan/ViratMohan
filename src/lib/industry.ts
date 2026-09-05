// Item 2 (internal half): summarize how frameworks have actually been
// applied before within FTDS for a given industry. This is NOT a success
// metric — there is no outcome-measurement loop yet (see
// tests/REGRESSION_COVERAGE.md gap notes) — it's a frequency + pipeline-
// progression signal, honestly weaker than a real track record, fed to the
// model as one input among several for the industry_relevance fit dimension.

// Reaching build_scheduled or later means a real client paid a deposit and
// committed to the build — the one concrete signal we have today that a
// framework's diagnosis/mechanism held up past the free demo stage. It is a
// proxy for "didn't visibly fail," not proof the P&L lever actually moved.
const PROGRESSED_STATUSES = new Set([
  'build_scheduled',
  'in_build',
  'uat',
  'delivered',
  'feedback_requested',
  'amc_active',
]);

export type PastFrameworkUsageRow = {
  status: string;
  framework_names: string[]; // the framework(s) actually selected (not runner-ups) for that submission
};

export type PastFrameworkUsage = {
  framework_name: string;
  times_applied: number;
  times_progressed: number; // reached build_scheduled+ — a weak positive signal, not a success rate
};

export function summarizeFrameworkUsage(rows: PastFrameworkUsageRow[]): PastFrameworkUsage[] {
  const map = new Map<string, PastFrameworkUsage>();
  for (const row of rows) {
    const progressed = PROGRESSED_STATUSES.has(row.status);
    for (const rawName of row.framework_names) {
      const name = rawName?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = map.get(key) ?? { framework_name: name, times_applied: 0, times_progressed: 0 };
      existing.times_applied += 1;
      if (progressed) existing.times_progressed += 1;
      map.set(key, existing);
    }
  }
  return [...map.values()].sort((a, b) => b.times_applied - a.times_applied);
}
