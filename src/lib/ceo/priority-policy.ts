// Priority for new Work, from the registry's own model: the risk factors in work/priority.ts decide, and
// suggestPriority turns them into P0..P4. This module only reads the request into those factors, by explicit
// rules, so the result is deterministic and every decision carries its reason.
//
// Three separate things, deliberately kept apart:
//   1. Creating Work (the create-work grant): never limits severity.
//   2. Rule floors: a recognised critical condition lands at the priority the factors give, P0 included.
//      That is applying the registry's rule, not CEO judgement, so it needs no approval.
//   3. Judgement above the rules (urgent wording with no recognised condition): not applied. It is shown as an
//      advisory that needs Virat (DS-00), so nothing is silently raised or silently downgraded.
// An explicit priority from the Founder ("make it P1") is his decision and is recorded as such.

import type { Priority, PriorityFactors, WorkType } from '../work/types';
import { NO_FACTORS, suggestPriority, urgency as rank } from '../work/priority';

export interface PriorityDecision {
  priority: Priority;
  type: WorkType;
  factors: PriorityFactors;
  suggested: Priority;
  basis: 'founder_instruction' | 'rule_floor' | 'rule_default';
  reason: string;
  advisory: { recommended: Priority; requires: 'DS-00'; why: string } | null;
}

const MONEY_PATH = /\b(checkout|payments?|payment\s+gateway|gateway|cart|orders?|storefront|store|website|site)\b/i;
const FAILURE = /\b(down|outage|offline|not\s+working|isn'?t\s+working|stopped\s+working|broken|failing|failures?|crash(?:ed|es|ing)?|unreachable|can'?t\s+(?:pay|check\s*out|order|buy))\b/i;
const OUTAGE = /\b(outage|down|offline|unavailable|not\s+working|unreachable)\b/i;
const PRODUCTION = /\b(production|prod)\b/i;
const CUSTOMER_HARM = /\bcustomers?\b[^.]*\b(can'?t|cannot|unable|charged\s+twice|double[-\s]charged|overcharged|wrong\s+(?:order|item)|not\s+received)\b/i;
const SECURITY_CRITICAL = /\b(hacked|breach(?:ed)?|compromised|leaked)\b/i;
const SECURITY_HIGH = /\b(vulnerab(?:le|ility)|exposed)\b/i;
const IMPROVEMENT = /\b(improve|enhance|polish|tidy|refactor|redesign|nice\s+to\s+have|backlog)\b/i;
// Asking about a rate or a report is not an incident.
const REVIEW_CONTEXT = /\b(review|reviewing|analy[sz]e|analysis|rates?|report|metrics?|trends?|costs?|budget|audit|forecast)\b/i;
const EXPLICIT = /\bP([0-4])\b/i;

/** A report of a recognised critical condition ("checkout is down") is a request to handle it, whatever its verbs. */
export function isIncidentReport(text: string): boolean {
  if (REVIEW_CONTEXT.test(text)) return false;
  return (MONEY_PATH.test(text) && FAILURE.test(text)) || (PRODUCTION.test(text) && OUTAGE.test(text)) || CUSTOMER_HARM.test(text) || SECURITY_CRITICAL.test(text) || SECURITY_HIGH.test(text);
}

export function decidePriority(text: string, wording: 'normal' | 'urgent' | 'critical'): PriorityDecision {
  const type: WorkType = IMPROVEMENT.test(text) ? 'improvement' : 'request';
  const factors: PriorityFactors = { ...NO_FACTORS };
  const signals: string[] = [];
  const incidentContext = !REVIEW_CONTEXT.test(text);

  if (incidentContext && MONEY_PATH.test(text) && FAILURE.test(text)) {
    factors.revenueProfitRisk = 'critical'; factors.operationalDisruption = 'critical';
    signals.push('a money path (checkout, payment, orders or store) is failing');
  }
  if (incidentContext && PRODUCTION.test(text) && OUTAGE.test(text)) {
    factors.operationalDisruption = 'critical';
    signals.push('production outage');
  }
  if (incidentContext && CUSTOMER_HARM.test(text)) {
    if (factors.customerHarm === 'none') factors.customerHarm = 'high';
    signals.push('customers are directly affected');
  }
  if (incidentContext && SECURITY_CRITICAL.test(text)) { factors.security = 'critical'; signals.push('security compromise'); }
  else if (incidentContext && SECURITY_HIGH.test(text)) { factors.security = 'high'; signals.push('security exposure'); }

  const suggested = suggestPriority(factors, type);
  const explicit = EXPLICIT.exec(text);

  if (explicit) {
    const chosen = `P${explicit[1]}` as Priority;
    return { priority: chosen, type, factors, suggested, basis: 'founder_instruction', reason: `Founder instruction: ${chosen}${suggested !== chosen ? ` (rules would give ${suggested})` : ''}`, advisory: null };
  }

  const recommended: Priority | null = wording === 'critical' ? 'P1' : wording === 'urgent' ? 'P2' : null;
  const advisory = recommended && rank(recommended) < rank(suggested)
    ? { recommended, requires: 'DS-00' as const, why: `The wording sounds ${wording} but matches no recognised critical condition, so it is held at ${suggested}. Raising it is Virat's call: reply "make it ${recommended}".` }
    : null;

  return signals.length
    ? { priority: suggested, type, factors, suggested, basis: 'rule_floor', reason: `Rule floor ${suggested}: ${signals.join('; ')}`, advisory }
    : { priority: suggested, type, factors, suggested, basis: 'rule_default', reason: `Default ${suggested}: no critical condition recognised`, advisory };
}
