// Date periods for brand dashboards: what "this week", "last month" or a custom range is,
// and what to compare it with (the period before, the same days last month, the same days
// last year), plus the before/after window around the day Retail OS took a brand over.
// Pure: every function takes "today" as an IST date string (YYYY-MM-DD). Periods are [start, end).
export type Range = { start: string; end: string; label: string };
export type PeriodKey = 'thisweek' | 'lastweek' | 'mtd' | 'lastmonth' | 'last30' | 'yesterday' | 'custom';
export type CompareMode = 'prev' | 'month' | 'year';

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'thisweek', label: 'This week' }, { key: 'lastweek', label: 'Last week' },
  { key: 'mtd', label: 'Month to date' }, { key: 'lastmonth', label: 'Last month' },
  { key: 'last30', label: 'Last 30 days' }, { key: 'yesterday', label: 'Yesterday' },
];
export const COMPARES: { key: CompareMode; label: string }[] = [
  { key: 'prev', label: 'Period before' }, { key: 'month', label: 'Same period last month' }, { key: 'year', label: 'Same period last year' },
];

const DAY = 86_400_000;
const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => fmt(new Date(d(ymd).getTime() + n * DAY));
export const daysBetween = (a: string, b: string) => Math.round((d(b).getTime() - d(a).getTime()) / DAY);
const isYmd = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d(s).getTime());
const short = (ymd: string) => d(ymd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const rangeLabel = (start: string, end: string) => (daysBetween(start, end) === 1 ? short(start) : `${short(start)} to ${short(addDays(end, -1))}`);

/** Shift a date by whole months, clamping to the month's last day (31 Mar - 1 month = 28/29 Feb). */
export function addMonths(ymd: string, n: number): string {
  const [y, m, day] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last))));
}

/** The selected period. Custom needs from/to (inclusive "to"); anything invalid falls back to this week. */
export function resolvePeriod(key: string | null, today: string, from?: string | null, to?: string | null): { key: PeriodKey; range: Range } {
  const dow = d(today).getUTCDay();
  const thisMonday = addDays(today, -((dow + 6) % 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  const r = (start: string, end: string, label: string): Range => ({ start, end, label });
  switch (key) {
    case 'custom':
      if (isYmd(from) && isYmd(to) && from <= to && to <= today) return { key: 'custom', range: r(from, addDays(to, 1), rangeLabel(from, addDays(to, 1))) };
      break;
    case 'lastweek': { const s = addDays(thisMonday, -7); return { key: 'lastweek', range: r(s, thisMonday, `Last week (${rangeLabel(s, thisMonday)})`) }; }
    case 'mtd': return { key: 'mtd', range: r(monthStart, addDays(today, 1), `Month to date (${rangeLabel(monthStart, addDays(today, 1))})`) };
    case 'lastmonth': { const s = addMonths(monthStart, -1); return { key: 'lastmonth', range: r(s, monthStart, `Last month (${rangeLabel(s, monthStart)})`) }; }
    case 'last30': { const s = addDays(today, -29); return { key: 'last30', range: r(s, addDays(today, 1), `Last 30 days (${rangeLabel(s, addDays(today, 1))})`) }; }
    case 'yesterday': { const y = addDays(today, -1); return { key: 'yesterday', range: r(y, today, `Yesterday (${short(y)})`) }; }
  }
  return { key: 'thisweek', range: r(thisMonday, addDays(today, 1), `This week so far (${rangeLabel(thisMonday, addDays(today, 1))})`) };
}

/** The period to compare against: same length immediately before, or the same dates last month / last year. */
export function comparePeriod(cur: Range, mode: CompareMode): Range {
  const len = daysBetween(cur.start, cur.end);
  if (mode === 'month' || mode === 'year') {
    const n = mode === 'month' ? -1 : -12;
    const start = addMonths(cur.start, n);
    const end = addDays(start, len);
    return { start, end, label: `${mode === 'month' ? 'Same period last month' : 'Same period last year'} (${rangeLabel(start, end)})` };
  }
  const start = addDays(cur.start, -len);
  return { start, end: cur.start, label: `Period before (${rangeLabel(start, cur.start)})` };
}

/**
 * Before vs after Retail OS: "after" runs from the takeover date to today; "before" is the same
 * number of days immediately before the takeover. Capped at 90 days each side so the two stay
 * comparable. Null if there is no takeover date or it is today or later.
 */
export function beforeAfter(takeover: string | null | undefined, today: string, maxDays = 90): { before: Range; after: Range; days: number } | null {
  if (!isYmd(takeover) || takeover >= today) return null;
  const days = Math.min(daysBetween(takeover, addDays(today, 1)), maxDays);
  const after = { start: takeover, end: addDays(takeover, days), label: `With Retail OS (${rangeLabel(takeover, addDays(takeover, days))})` };
  const before = { start: addDays(takeover, -days), end: takeover, label: `Before Retail OS (${rangeLabel(addDays(takeover, -days), takeover)})` };
  return { before, after, days };
}

/** Percentage change, rounded; null when there is nothing to compare against. */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}
