import { describe, expect, it } from 'vitest';
import { suggestPriority, NO_FACTORS, moreUrgent, isLessUrgent, type PriorityFactors } from '../../../src/lib/work';

const f = (o: Partial<PriorityFactors>): PriorityFactors => ({ ...NO_FACTORS, ...o });

describe('priority from the agreed factors (levels, not a score)', () => {
  it.each([
    ['customer harm critical', { customerHarm: 'critical' }, 'task', 'P0'],
    ['revenue/profit critical', { revenueProfitRisk: 'critical' }, 'task', 'P0'],
    ['security critical', { security: 'critical' }, 'incident', 'P0'],
    ['operational disruption critical', { operationalDisruption: 'critical' }, 'alert', 'P0'],
    ['customer harm high', { customerHarm: 'high' }, 'support', 'P1'],
    ['security high', { security: 'high' }, 'task', 'P1'],
    ['promise at risk', { promiseRisk: 'at_risk' }, 'request', 'P1'],
    ['promise breached', { promiseRisk: 'breached' }, 'request', 'P1'],
    ['blocks a P0', { blocksPriority: 'P0' }, 'task', 'P1'],
    ['blocks a P1', { blocksPriority: 'P1' }, 'task', 'P1'],
    ['revenue risk low', { revenueProfitRisk: 'low' }, 'task', 'P2'],
    ['promise coming up', { promiseRisk: 'soon' }, 'request', 'P2'],
    ['core to strategy', { strategic: 'core' }, 'opportunity', 'P2'],
    ['blocks a P2', { blocksPriority: 'P2' }, 'task', 'P2'],
    ['nothing notable', {}, 'request', 'P3'],
    ['supports strategy only', { strategic: 'supports' }, 'improvement', 'P3'],
    ['improvement touching nothing', {}, 'improvement', 'P4'],
    ['opportunity touching nothing', {}, 'opportunity', 'P4'],
  ] as const)('%s → %s', (_n, factors, type, expected) => {
    expect(suggestPriority(f(factors as Partial<PriorityFactors>), type)).toBe(expected);
  });

  it('the most urgent applicable rule wins', () => {
    expect(suggestPriority(f({ customerHarm: 'low', security: 'critical', promiseRisk: 'soon' }), 'task')).toBe('P0');
    expect(suggestPriority(f({ revenueProfitRisk: 'low', promiseRisk: 'breached' }), 'task')).toBe('P1');
  });

  it('a blocker never ranks below what it blocks', () => {
    for (const p of ['P0', 'P1'] as const) expect(['P0', 'P1']).toContain(suggestPriority(f({ blocksPriority: p }), 'improvement'));
  });

  it('urgency helpers', () => {
    expect(moreUrgent('P1', 'P3')).toBe('P1');
    expect(isLessUrgent('P3', 'P1')).toBe(true);
    expect(isLessUrgent('P1', 'P3')).toBe(false);
  });
});
