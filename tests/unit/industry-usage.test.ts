import { describe, it, expect } from 'vitest';
import { summarizeFrameworkUsage } from '../../src/lib/industry';

describe('summarizeFrameworkUsage', () => {
  it('counts times applied and merges case/whitespace variants of the same framework', () => {
    const result = summarizeFrameworkUsage([
      { status: 'sent', framework_names: ['AARRR (Pirate Metrics)'] },
      { status: 'in_build', framework_names: [' aarrr (pirate metrics) '] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].times_applied).toBe(2);
  });

  it('counts a submission as "progressed" only once it reached build_scheduled or later', () => {
    const result = summarizeFrameworkUsage([
      { status: 'sent', framework_names: ['AARRR (Pirate Metrics)'] }, // demo sent, not yet committed
      { status: 'build_scheduled', framework_names: ['AARRR (Pirate Metrics)'] },
      { status: 'amc_active', framework_names: ['AARRR (Pirate Metrics)'] },
    ]);
    const aarrr = result.find((r) => r.framework_name === 'AARRR (Pirate Metrics)')!;
    expect(aarrr.times_applied).toBe(3);
    expect(aarrr.times_progressed).toBe(2);
  });

  it('handles a submission with multiple problems/frameworks without double-counting across the same row incorrectly', () => {
    const result = summarizeFrameworkUsage([{ status: 'delivered', framework_names: ['Lean (Toyota Production System)', 'Theory of Constraints'] }]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.times_applied === 1 && r.times_progressed === 1)).toBe(true);
  });

  it('ranks the most-applied framework first', () => {
    const result = summarizeFrameworkUsage([
      { status: 'sent', framework_names: ['Framework A'] },
      { status: 'sent', framework_names: ['Framework A'] },
      { status: 'sent', framework_names: ['Framework B'] },
    ]);
    expect(result[0].framework_name).toBe('Framework A');
    expect(result[0].times_applied).toBe(2);
  });

  it('ignores blank/missing framework names rather than counting them', () => {
    const result = summarizeFrameworkUsage([{ status: 'sent', framework_names: ['', '  ', 'Real Framework'] }]);
    expect(result).toHaveLength(1);
    expect(result[0].framework_name).toBe('Real Framework');
  });

  it('returns an empty array for no history', () => {
    expect(summarizeFrameworkUsage([])).toEqual([]);
  });
});
