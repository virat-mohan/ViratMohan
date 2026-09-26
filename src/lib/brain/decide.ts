// The PLAYBOOK decision test (case-study/PLAYBOOK.md), deterministic on purpose:
// the routing of money, terms, legal, public claims and irreversible actions must never depend on a model.
import type { Decision, Situation } from './types';

const ALWAYS_VIRAT: { tag: string; why: string; re: RegExp }[] = [
  { tag: 'money', why: 'Money moving: Virat decides.', re: /\b(pay(ment|out)?s?|refund|transfer|settle(ment)?|invoice|₹|inr|rs\.?|rupees?|spend|budget|deposit|withdraw|charge|payable|salary)\b/i },
  { tag: 'pricing', why: 'Pricing or terms change: Virat decides.', re: /\b(pric(e|es|ing)|discount|terms?|split|commission|rate card|profit pool|contract|agreement|fee)\b/i },
  { tag: 'legal', why: 'Legal or tax: pause and ask Virat (CA or lawyer), never guess.', re: /\b(legal|lawyer|lawsuit|gst|tax|compliance|notice|court|nda|ncnda|trademark|licen[cs]e)\b/i },
  { tag: 'public_claim', why: 'Public claim or launch: Virat approves first.', re: /\b(announce|launch|press|publish(ed)?|public claim|post (on|to) (instagram|linkedin|x|twitter)|testimonial|case study)\b/i },
  { tag: 'hiring', why: 'Hiring or firing: Virat decides.', re: /\b(hire|hiring|fire|firing|terminate|offer letter)\b/i },
  { tag: 'investor', why: 'Investors: listen, share only real numbers, Virat decides.', re: /\b(investor|funding|raise|valuation|term sheet)\b/i },
  { tag: 'customer_data', why: 'Touches customer data or access: Virat decides.', re: /\b(customer (data|list|details|records)|export (customers|contacts)|grant access|share (their|customer) (number|email|phone))\b/i },
  { tag: 'irreversible', why: 'Irreversible: Virat decides.', re: /\b(delete|drop table|force[- ]push|permanent(ly)?|irreversible|cancel (the )?(order|contract)|wipe)\b/i },
];
const DISHONEST = /\b(fake|made[- ]up|invent(ed)?|buy (reviews|followers)|spam|dark pattern|hidden fee)\b/i;
const ACT_ALONE = /\b(fix|polish|draft|report|test|internal doc|typo|queued post|refactor|design)\b/i;

export function decide(s: Situation): Decision {
  const text = `${s.action} ${s.details ?? ''}`;
  const tags = new Set((s.tags ?? []).map((t) => t.toLowerCase()));
  if (s.amountInr && s.amountInr > 0) tags.add('money');
  if (s.reversible === false) tags.add('irreversible');
  if (s.public) tags.add('public_claim');
  if (s.touchesCustomerData) tags.add('customer_data');
  if (tags.has('terms')) tags.add('pricing');
  if (tags.has('tax')) tags.add('legal');
  if (tags.has('launch')) tags.add('public_claim');
  for (const r of ALWAYS_VIRAT) if (r.re.test(text)) tags.add(r.tag);

  const reasons = ALWAYS_VIRAT.filter((r) => tags.has(r.tag)).map((r) => r.why);
  const dishonest = DISHONEST.test(text);
  const unsourcedNumber = /\d/.test(s.action) && s.public && !/source[:=]/i.test(text);

  const checks: Decision['checks'] = [
    { step: 1, name: 'honest', ok: !dishonest && !unsourcedNumber, note: dishonest ? 'Looks like a shortcut the playbook forbids.' : unsourcedNumber ? 'Public number without a source.' : 'No invented numbers seen.' },
    { step: 2, name: 'fair', ok: !/hidden|lock[- ]in|penalt/i.test(text), note: 'Checked for hidden fees and lock-ins.' },
    { step: 3, name: 'keeps promises', ok: !/delay (the )?launch|miss (the )?monday|skip settlement/i.test(text), note: 'Checked against 7-day launch, Monday settlement, honest numbers.' },
    { step: 4, name: 'creates value', ok: true, note: 'Assumed; the caller owns this judgement.' },
    { step: 5, name: 'machine can do it', ok: reasons.length === 0, note: reasons.length ? 'Needs judgement, money or legal risk.' : 'Routine; automate it.' },
    { step: 6, name: 'calm and beautiful', ok: true, note: 'Checked at review, not here.' },
  ];
  if (dishonest) reasons.unshift('Fails the honesty test: do not do it, and tell Virat.');
  if (unsourcedNumber) reasons.push('Public number without a source: honesty test.');
  if (!checks[1].ok) reasons.push('Fairness concern: hidden fee or lock-in.');
  if (!checks[2].ok) reasons.push('Risks breaking a promise.');

  if (reasons.length) return { verdict: 'ask Virat', reasons, checks };
  return { verdict: 'act alone', reasons: [ACT_ALONE.test(text) ? 'Routine work the playbook lets me do alone.' : 'Passes the decision test; nothing needs judgement, money or legal risk.'], checks };
}
