import { describe, it, expect } from 'vitest';
import { resolvePeriod, comparePeriod, beforeAfter, addMonths, pctChange, daysBetween } from '../../src/lib/period-compare';

const TODAY = '2026-09-28'; // a Monday

describe('periods', () => {
  it('this week, last week, month to date, last month, last 30 days, yesterday', () => {
    expect(resolvePeriod('thisweek', TODAY).range).toMatchObject({ start: '2026-09-28', end: '2026-09-29' });
    expect(resolvePeriod('lastweek', TODAY).range).toMatchObject({ start: '2026-09-21', end: '2026-09-28' });
    expect(resolvePeriod('mtd', TODAY).range).toMatchObject({ start: '2026-09-01', end: '2026-09-29' });
    expect(resolvePeriod('lastmonth', TODAY).range).toMatchObject({ start: '2026-08-01', end: '2026-09-01' });
    expect(daysBetween(resolvePeriod('last30', TODAY).range.start, resolvePeriod('last30', TODAY).range.end)).toBe(30);
    expect(resolvePeriod('yesterday', TODAY).range).toMatchObject({ start: '2026-09-27', end: '2026-09-28' });
  });
  it('custom range is inclusive of "to"; invalid input falls back to this week', () => {
    expect(resolvePeriod('custom', TODAY, '2026-09-01', '2026-09-15')).toMatchObject({ key: 'custom', range: { start: '2026-09-01', end: '2026-09-16' } });
    expect(resolvePeriod('custom', TODAY, '2026-09-15', '2026-09-01').key).toBe('thisweek');
    expect(resolvePeriod('custom', TODAY, '2026-09-01', '2026-12-01').key).toBe('thisweek'); // future
    expect(resolvePeriod('nonsense', TODAY).key).toBe('thisweek');
  });
});

describe('comparisons', () => {
  const sep1to15 = { start: '2026-09-01', end: '2026-09-16', label: '' };
  it('period before is the same number of days immediately before', () => {
    expect(comparePeriod(sep1to15, 'prev')).toMatchObject({ start: '2026-08-17', end: '2026-09-01' });
  });
  it('same period last month and last year keep the length', () => {
    expect(comparePeriod(sep1to15, 'month')).toMatchObject({ start: '2026-08-01', end: '2026-08-16' });
    expect(comparePeriod(sep1to15, 'year')).toMatchObject({ start: '2025-09-01', end: '2025-09-16' });
  });
  it('month shifts clamp to the last day', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
  });
});

describe('before vs after Retail OS', () => {
  it('uses equal windows either side of the takeover date', () => {
    const w = beforeAfter('2026-09-24', TODAY)!;
    expect(w.days).toBe(5);
    expect(w.after).toMatchObject({ start: '2026-09-24', end: '2026-09-29' });
    expect(w.before).toMatchObject({ start: '2026-09-19', end: '2026-09-24' });
  });
  it('caps each side at 90 days and needs a past takeover date', () => {
    expect(beforeAfter('2025-01-01', TODAY)!.days).toBe(90);
    expect(beforeAfter(null, TODAY)).toBeNull();
    expect(beforeAfter(TODAY, TODAY)).toBeNull();
  });
  it('percentage change', () => {
    expect(pctChange(159, 100)).toBe(59);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
  });
});
