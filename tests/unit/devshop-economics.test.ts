import { describe, it, expect } from 'vitest';
import {
  hoursByRole, totalHours, founderHours, directCostPaise, directLabourCostPaise,
  revenueOnBasis, projectContribution, contributionPerHour, contributionPerFounderHour,
  hoursVariance, deliveryVariance, amcMonthlyEconomics,
  type WorkLogEntry, type DirectCost, type ProjectRevenue,
} from '../../src/lib/devshop-economics';

const log: WorkLogEntry[] = [
  { date: '2026-10-01', role: 'software_engineer', hours: 10, category: 'BUILD' },
  { date: '2026-10-02', role: 'qa_uat', hours: 4, category: 'QA' },
  { date: '2026-10-02', role: 'founder', hours: 3, category: 'CLIENT' },
];
const costs: DirectCost[] = [
  { amountPaise: 500_00, category: 'hosting', attribution: 'direct', source: 'vercel', actual: true },
  { amountPaise: 200_00, category: 'llm', attribution: 'direct', source: 'anthropic', actual: true },
  { amountPaise: 900_00, category: 'office', attribution: 'overhead', source: 'rent', actual: true },
  { amountPaise: 300_00, category: 'shared-tool', attribution: 'shared', source: 'figma', actual: true },
];

describe('hours', () => {
  it('D. records hours by role and total', () => {
    expect(hoursByRole(log)).toEqual({ software_engineer: 10, qa_uat: 4, founder: 3 });
    expect(totalHours(log)).toBe(17);
  });
  it('E. founder hours are separately measurable', () => {
    expect(founderHours(log)).toBe(3);
  });
});

describe('F. cost attribution', () => {
  it('only direct costs count; shared and overhead are excluded', () => {
    expect(directCostPaise(costs)).toBe(700_00); // 500 + 200, not 900 (overhead) or 300 (shared)
  });
  it('labour cost is UNKNOWN without authoritative rates (never guessed or zero)', () => {
    expect(directLabourCostPaise(log)).toEqual({ known: false, reason: 'no per-role cost rates supplied' });
  });
  it('labour cost excludes founder hours and needs a rate for every billable role', () => {
    const partial = directLabourCostPaise(log, { software_engineer: 100_00 });
    expect(partial.known).toBe(false); // qa_uat rate missing
    const full = directLabourCostPaise(log, { software_engineer: 100_00, qa_uat: 50_00, founder: 999_00 });
    expect(full).toEqual({ known: true, value: 10 * 100_00 + 4 * 50_00 }); // founder not billed
  });
});

describe('revenue', () => {
  it('B/C. deposit/proposal are not collected revenue; each basis is distinct', () => {
    const rev: ProjectRevenue = { contractedPaise: 300000_00, invoicedPaise: 150000_00, collectedPaise: 100000_00 };
    expect(revenueOnBasis(rev, 'contracted')).toEqual({ known: true, value: 300000_00 });
    expect(revenueOnBasis(rev, 'collected')).toEqual({ known: true, value: 100000_00 });
    expect(revenueOnBasis({}, 'collected').known).toBe(false); // missing → UNKNOWN, not 0
  });
});

describe('G/H. project contribution', () => {
  it('is deterministic and, without rates, is "before labour" with hours exposed', () => {
    const rev: ProjectRevenue = { collectedPaise: 100000_00 };
    const c = projectContribution(rev, costs, log);
    expect(c.known).toBe(true);
    if (c.known) {
      expect(c.value.includesLabour).toBe(false);
      expect(c.value.directNonLabourPaise).toBe(700_00);
      expect(c.value.contributionPaise).toBe(100000_00 - 700_00);
      expect(c.value.totalHours).toBe(17);
      expect(c.value.founderHours).toBe(3);
    }
  });
  it('includes labour when authoritative rates are supplied', () => {
    const rev: ProjectRevenue = { collectedPaise: 100000_00 };
    const c = projectContribution(rev, costs, log, { ratePaisePerHour: { software_engineer: 100_00, qa_uat: 50_00 } });
    expect(c.known).toBe(true);
    if (c.known) {
      expect(c.value.includesLabour).toBe(true);
      expect(c.value.directLabourPaise).toBe(1200_00);
      expect(c.value.contributionPaise).toBe(100000_00 - 700_00 - 1200_00);
    }
  });
  it('H. missing revenue makes contribution UNKNOWN, never zero', () => {
    expect(projectContribution({}, costs, log).known).toBe(false);
  });
});

describe('unit economics', () => {
  it('contribution per hour and per founder hour, only when hours exist', () => {
    const c = projectContribution({ collectedPaise: 100000_00 }, [], log);
    if (!c.known) throw new Error('expected known');
    expect(contributionPerHour(c.value).known).toBe(true);
    expect(contributionPerFounderHour(c.value).known).toBe(true);
    const noHours = projectContribution({ collectedPaise: 100000_00 }, [], []);
    if (!noHours.known) throw new Error('expected known');
    expect(contributionPerHour(noHours.value).known).toBe(false);
  });
});

describe('I. estimate vs actual', () => {
  it('hours variance only when an authoritative estimate exists', () => {
    expect(hoursVariance(null, log).known).toBe(false);
    expect(hoursVariance(20, log)).toEqual({ known: true, value: { estimated: 20, actual: 17, deltaHours: -3 } });
  });
  it('delivery variance needs both a target and an actual go-live', () => {
    expect(deliveryVariance(null, null).known).toBe(false);
    expect(deliveryVariance('2026-10-30T00:00:00Z', null).known).toBe(false);
    const v = deliveryVariance('2026-10-30T00:00:00Z', '2026-10-28T00:00:00Z');
    expect(v).toEqual({ known: true, value: { onTime: true, deltaDays: -2 } });
  });
});

describe('J. AMC economics are separate from build economics', () => {
  it('computes AMC contribution-before-labour and keeps support/founder hours', () => {
    const amc = amcMonthlyEconomics({ collectedPaise: 50000_00, techCostPaise: 5000_00, log: [
      { date: '2026-11-01', role: 'software_engineer', hours: 6, category: 'SUPPORT' },
      { date: '2026-11-02', role: 'founder', hours: 1, category: 'SUPPORT' },
    ] });
    expect(amc.known).toBe(true);
    if (amc.known) {
      expect(amc.value.contributionBeforeLabourPaise).toBe(45000_00);
      expect(amc.value.supportHours).toBe(7);
      expect(amc.value.founderHours).toBe(1);
    }
  });
  it('AMC without recorded revenue or tech cost is UNKNOWN', () => {
    expect(amcMonthlyEconomics({ techCostPaise: 5000_00, log: [] }).known).toBe(false);
    expect(amcMonthlyEconomics({ collectedPaise: 50000_00, log: [] }).known).toBe(false);
  });
});
