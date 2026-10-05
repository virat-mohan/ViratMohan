// Priority from the agreed factors. Levels, not a score: the most urgent applicable rule wins.
//
//   P0 Critical   any of customer harm, revenue/profit, security, operational disruption is CRITICAL
//   P1 Urgent     any of those is HIGH, or a promise is at risk or breached, or it blocks P0/P1 work
//   P2 Important  any of those is LOW, or a promise is coming up, or it is core to strategy, or it blocks P2 work
//   P3 Normal     everything else
//   P4 Backlog    improvements and opportunities that touch none of the factors
//
// This is a suggestion. The triager sets the priority; going LESS urgent than the suggestion
// needs a written reason, which is recorded. No invented thresholds: every factor is an input.

import type { Priority, PriorityFactors, RiskLevel, WorkType } from './types';

const RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
/** Lower number = more urgent. */
export const urgency = (p: Priority): number => RANK[p];
export const moreUrgent = (a: Priority, b: Priority): Priority => (RANK[a] <= RANK[b] ? a : b);
export const isLessUrgent = (chosen: Priority, than: Priority): boolean => RANK[chosen] > RANK[than];

export const NO_FACTORS: PriorityFactors = {
  customerHarm: 'none', revenueProfitRisk: 'none', security: 'none', operationalDisruption: 'none',
  promiseRisk: 'none', strategic: 'none', blocksPriority: null,
};

export function suggestPriority(f: PriorityFactors, type: WorkType): Priority {
  const core: RiskLevel[] = [f.customerHarm, f.revenueProfitRisk, f.security, f.operationalDisruption];
  if (core.includes('critical')) return 'P0';
  if (core.includes('high') || f.promiseRisk === 'at_risk' || f.promiseRisk === 'breached' || f.blocksPriority === 'P0' || f.blocksPriority === 'P1') return 'P1';
  if (core.includes('low') || f.promiseRisk === 'soon' || f.strategic === 'core' || f.blocksPriority === 'P2') return 'P2';
  const touchesNothing = f.strategic === 'none' && f.promiseRisk === 'none';
  if ((type === 'improvement' || type === 'opportunity') && touchesNothing) return 'P4';
  return 'P3';
}
