// Plan generator: audit -> a written plan in Virat's voice.
// Numbers never come from the model. Claude writes prose with {{placeholders}} only; any digit it writes
// outside a placeholder rejects its draft and the plain template is used instead. Every number on the
// plan is therefore a formatted figure from the snapshots, a benchmark, or a standard term.
import { BENCHMARKS, type Audit, type Figure, type Gap, type Unit } from './lead-audit';
import { decide } from './brain/decide';
import { STABLE_PREFIX } from './brain/knowledge';
import type { ClaudeClient } from './brain/claude';
import type { Decision } from './brain/types';

export const PLAN_DAYS = 90;
export const STANDARD_TERMS = {
  profitShare: { name: 'Profit share', value: '40% of the profit pool' },
  revenueShare: { name: 'Revenue share', value: '15–20% of revenue' },
  retainer: { name: 'Retainer', value: 'from ₹2.5L a month' },
} as const;
const RETAINER_FLOOR_INR = 250000;

export type PlanLine = { label: string; value: string; source: string };
export type PlanGap = { title: string; now: string; benchmark: string; impact: string; basis: string; why: string; sources: string[] };
export type PlanTerm = { name: string; value: string; fits: boolean; why: string };
export type LeadPlan = {
  brand: string;
  firstName: string | null;
  generatedAt: string;
  byDate: string;
  intro: string;
  standing: PlanLine[];
  topSkus: { title: string; revenue: string }[];
  topQueries: { query: string; clicks: string }[];
  channelMix: { channel: string; share: string }[];
  gaps: PlanGap[];
  goal: { statement: string; metric: string; baseline: string; target: string; byDate: string; worth: string | null };
  run: string[];
  terms: PlanTerm[];
  recommendedTerm: string;
  closing: string;
  missing: string[];
  benchmarksNote: string;
  approval: Decision;
  writtenBy: 'claude' | 'template';
  model: string | null;
};

// ---------------------------------------------------------------------------------------------------
// Formatting (the only way a number reaches the page)
// ---------------------------------------------------------------------------------------------------

export function fmt(value: number, unit: Unit): string {
  switch (unit) {
    case 'inr': return '₹' + Math.round(value).toLocaleString('en-IN');
    case 'pct': return `${(value * 100).toFixed(1)}%`;
    case 'x': return `${value.toFixed(1)}x`;
    case 'pos': return value.toFixed(1);
    default: return Math.round(value).toLocaleString('en-IN');
  }
}
const fmtFig = (f: Figure) => fmt(f.value, f.unit);
export const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
const SOURCE_NAMES: Record<string, string> = { shopify: 'Shopify', meta: 'Meta ads', ga4: 'Google Analytics', gsc: 'Search Console', amazon: 'Amazon', flipkart: 'Flipkart' };

/** Every number token in a piece of text: ₹1,23,456 / 12.5% / 2.4x / 15–20% / 2.5L / 2026. */
export function numbersIn(text: string): string[] {
  return text.match(/₹?\d[\d,]*(\.\d+)?(–\d+)?(%|x|L)?/g) ?? [];
}

// ---------------------------------------------------------------------------------------------------
// Goal, run, terms: deterministic from the audit
// ---------------------------------------------------------------------------------------------------

export function smartGoal(audit: Audit, by: Date): LeadPlan['goal'] {
  const byDate = fmtDate(by);
  const g = audit.gaps[0];
  if (!g) {
    return {
      statement: `Connect the missing sources and agree one measurable goal on your real numbers by ${byDate}.`,
      metric: 'Data connected', baseline: 'Not enough data yet', target: 'All sources connected', byDate, worth: null,
    };
  }
  const f = audit.figures[g.metric];
  if (g.key === 'decline') {
    return {
      statement: `Stop the slide: bring monthly revenue back up by ${fmt(g.monthlyImpactInr, 'inr')} a month by ${byDate}.`,
      metric: 'Monthly revenue', baseline: fmtFig(f), target: `+${fmt(g.monthlyImpactInr, 'inr')} a month`, byDate, worth: fmt(g.monthlyImpactInr, 'inr'),
    };
  }
  // Achievable: close half the gap to the benchmark in 90 days.
  const target = g.baseline + (g.benchmark - g.baseline) / 2;
  const worth = Math.round(g.monthlyImpactInr / 2 / 100) * 100;
  const verb = g.benchmark > g.baseline ? 'Lift' : 'Bring down';
  const label = f?.label.toLowerCase() ?? g.metric;
  return {
    statement: `${verb} ${label} from ${fmt(g.baseline, g.unit)} to ${fmt(target, g.unit)} by ${byDate}, worth about ${fmt(worth, 'inr')} a month.`,
    metric: f?.label ?? g.metric, baseline: fmt(g.baseline, g.unit), target: fmt(target, g.unit), byDate, worth: fmt(worth, 'inr'),
  };
}

const RUN_FOR_GAP: Record<string, string> = {
  repeat: 'Win customers back: a WhatsApp and email follow-up after every order, a reorder reminder timed to how long the product lasts, and a thank-you for second orders.',
  conversion: 'Fix the store where people drop off: faster pages, clearer product pages, COD and UPI at checkout, and cart recovery on WhatsApp.',
  roas: 'Rebuild the ads: cut the campaigns that do not pay back, move spend to the ones that do, and test fresh creative every week.',
  returns: 'Cut refunds: better size and product information, checks before dispatch, and a call on the reasons behind every refund.',
  rto: 'Cut RTO: confirm COD orders on WhatsApp before they ship, nudge prepaid, and flag risky pin codes.',
  decline: 'Find where the slide starts (channel, product or ads), fix the biggest cause first, and track it weekly.',
  search: 'Rewrite titles and descriptions for the page-one searches people see but do not click.',
};

export function runPlan(audit: Audit): string[] {
  return [
    ...audit.gaps.map((g) => RUN_FOR_GAP[g.key]).filter(Boolean),
    'I run it for you: store, ads, WhatsApp, marketplaces and reporting, with one person accountable.',
    'Anything new that needs building (a store, a channel, a flow) is live in 7 days.',
    'You get results every Monday: target, actual, gap and next step, on your real numbers.',
  ];
}

/** Which standard terms fit. No custom terms. */
export function fitTerms(audit: Audit): { terms: PlanTerm[]; recommended: string } {
  const monthly = audit.figures.monthly_revenue?.value ?? null;
  const trend = audit.figures.revenue_trend?.value ?? null;
  const steady = monthly !== null && (trend === null || trend >= BENCHMARKS.declineFloor);
  // A retainer only fits when it stays under a tenth of monthly revenue.
  const retainerFits = monthly !== null && monthly >= RETAINER_FLOOR_INR * 10;
  const terms: PlanTerm[] = [
    { ...STANDARD_TERMS.profitShare, fits: !steady || !retainerFits, why: 'I only earn when the business makes a profit, so it fits best while numbers are small, sliding or not yet clean.' },
    { ...STANDARD_TERMS.revenueShare, fits: steady && !retainerFits, why: 'Simple to track and settle every Monday. It fits once revenue is steady.' },
    { ...STANDARD_TERMS.retainer, fits: retainerFits, why: 'A fixed monthly fee. It fits only when it stays a small share of monthly revenue.' },
  ];
  const recommended = retainerFits ? STANDARD_TERMS.retainer.name : steady ? STANDARD_TERMS.revenueShare.name : STANDARD_TERMS.profitShare.name;
  return { terms, recommended };
}

// ---------------------------------------------------------------------------------------------------
// Prose: Claude with placeholders, or the template
// ---------------------------------------------------------------------------------------------------

type Prose = { intro: string; gapWhy: string[]; closing: string };
const ALLOWED_PHRASES = /\b(7|seven)[- ]days?\b|\b90[- ]days?\b|\b90-day\b/gi;

export function templateProse(brand: string, firstName: string | null, audit: Audit): Prose {
  return {
    intro: `${firstName ? `${firstName}, thank` : 'Thank'} you for giving me read-only access. I have gone through ${brand}'s numbers myself. Here is where you stand, the three gaps that cost the most, and how I would close them.`,
    gapWhy: audit.gaps.map((g) => `This is the biggest money on the table after the gaps above it. ${g.basis}`),
    closing: "If this looks right to you, let's talk. I'll walk you through it and we can start the week after.",
  };
}

/** Substitutes {{key}} from `vars`. Returns null if the text has a digit outside a placeholder or an unknown key. */
export function fillPlaceholders(text: string, vars: Record<string, string>): string | null {
  const bare = text.replace(/\{\{\s*[a-z0-9_]+\s*\}\}/gi, '').replace(ALLOWED_PHRASES, '');
  if (/\d/.test(bare)) return null;
  let bad = false;
  const out = text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) => (k in vars ? vars[k] : ((bad = true), '')));
  return bad ? null : out;
}

async function claudeProse(claude: ClaudeClient, brand: string, firstName: string | null, audit: Audit, vars: Record<string, string>): Promise<{ prose: Prose; model: string } | null> {
  const res = await claude.complete({
    stakes: 'high',
    stablePrefix: STABLE_PREFIX,
    system: [
      "Write short prose for a data-audit plan to a founder, in Virat's voice: first person I, plain words, warm, calm, no hype.",
      'NEVER write a digit. For any number use a placeholder from the list exactly, like {{aov}}. Use only listed placeholders.',
      'Reply with JSON only: {"intro": string (2 sentences), "gap_why": string[] (one sentence per gap, same order), "closing": string (1-2 sentences ending with "Let\'s talk.")}.',
    ].join('\n'),
    user: JSON.stringify({
      brand, first_name: firstName,
      placeholders: Object.keys(vars),
      gaps: audit.gaps.map((g) => ({ title: g.title, metric_placeholder: g.metric, impact_placeholder: `gap_${g.key}_impact` })),
    }),
    maxTokens: 700,
  });
  let parsed: { intro?: string; gap_why?: string[]; closing?: string };
  try { parsed = JSON.parse(res.text.replace(/^```(json)?|```$/g, '').trim()); } catch { return null; }
  const intro = parsed.intro ? fillPlaceholders(parsed.intro, vars) : null;
  const closing = parsed.closing ? fillPlaceholders(parsed.closing, vars) : null;
  const gapWhy = (parsed.gap_why ?? []).map((t) => fillPlaceholders(t, vars));
  if (!intro || !closing || gapWhy.length !== audit.gaps.length || gapWhy.some((x) => x === null)) return null;
  return { prose: { intro, closing, gapWhy: gapWhy as string[] }, model: res.model };
}

// ---------------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------------

export type PlanInput = { brand: string; contactName?: string | null; audit: Audit; now?: Date; claude?: ClaudeClient };

export async function generatePlan(input: PlanInput): Promise<LeadPlan> {
  const { brand, audit } = input;
  const now = input.now ?? new Date();
  const by = new Date(now.getTime() + PLAN_DAYS * 86_400_000);
  const firstName = input.contactName?.trim().split(/\s+/)[0] || null;

  const vars: Record<string, string> = {};
  for (const f of Object.values(audit.figures)) vars[f.key] = fmtFig(f);
  for (const g of audit.gaps) vars[`gap_${g.key}_impact`] = fmt(g.monthlyImpactInr, 'inr');

  let prose = templateProse(brand, firstName, audit);
  let writtenBy: LeadPlan['writtenBy'] = 'template';
  let model: string | null = null;
  if (input.claude) {
    try {
      const got = await claudeProse(input.claude, brand, firstName, audit, vars);
      if (got) { prose = got.prose; writtenBy = 'claude'; model = got.model; }
    } catch (err) {
      console.error('plan prose: falling back to template', err);
    }
  }

  const order = ['monthly_revenue', 'revenue_trend', 'orders', 'aov', 'repeat_rate', 'return_rate', 'rto_rate', 'ad_spend', 'roas', 'blended_roas', 'cac', 'sessions', 'conversion_rate', 'search_clicks', 'search_ctr'];
  const standing = order.filter((k) => audit.figures[k]).map((k) => {
    const f = audit.figures[k];
    return { label: f.label, value: fmtFig(f), source: f.source };
  });

  const gaps: PlanGap[] = audit.gaps.map((g: Gap, i) => ({
    title: g.title,
    now: fmt(g.baseline, g.unit),
    benchmark: g.key === 'decline' ? 'flat or growing' : fmt(g.benchmark, g.unit),
    impact: `${fmt(g.monthlyImpactInr, 'inr')} a month`,
    basis: g.basis,
    why: prose.gapWhy[i] ?? g.basis,
    sources: [...new Set(g.uses.map((k) => audit.figures[k]?.source).filter(Boolean) as string[])],
  }));

  const { terms, recommended } = fitTerms(audit);
  const approval = decide({ action: `Send ${brand} their data-audit plan and the standard terms that fit`, details: 'plan with pricing terms', tags: ['terms'] });

  return {
    brand,
    firstName,
    generatedAt: now.toISOString(),
    byDate: fmtDate(by),
    intro: prose.intro,
    standing,
    topSkus: audit.topSkus.map((s) => ({ title: s.title || s.sku, revenue: fmt(s.revenue, 'inr') })),
    topQueries: audit.topQueries.map((q) => ({ query: q.query, clicks: fmt(q.clicks, 'count') })),
    channelMix: audit.channelMix.map((c) => ({ channel: c.channel, share: fmt(c.share, 'pct') })),
    gaps,
    goal: smartGoal(audit, by),
    run: runPlan(audit),
    terms,
    recommendedTerm: recommended,
    closing: prose.closing,
    missing: audit.missing.map((s) => SOURCE_NAMES[s] ?? s),
    benchmarksNote: 'Benchmarks are the levels I size gaps against, not your numbers. Every other number here comes from your own data, with its source beside it.',
    approval,
    writtenBy,
    model,
  };
}

/** Every number a plan may show: figures, gap sizes, goal maths, benchmarks, standard terms, dates. */
export function allowedNumbers(audit: Audit, plan: LeadPlan): Set<string> {
  const ok = new Set<string>();
  const add = (s: string) => numbersIn(s).forEach((n) => ok.add(n));
  for (const f of Object.values(audit.figures)) { add(fmtFig(f)); add(f.label); add(f.source); }
  for (const g of audit.allGaps) { add(fmt(g.monthlyImpactInr, 'inr')); add(fmt(g.baseline, g.unit)); add(fmt(g.benchmark, g.unit)); add(g.basis); }
  for (const s of audit.topSkus) add(fmt(s.revenue, 'inr'));
  for (const q of audit.topQueries) add(fmt(q.clicks, 'count'));
  for (const c of audit.channelMix) add(fmt(c.share, 'pct'));
  add(plan.goal.statement); add(plan.goal.target); add(plan.goal.worth ?? ''); add(plan.byDate);
  for (const t of Object.values(STANDARD_TERMS)) add(t.value);
  add('7 days 90 days');
  return ok;
}

/** Plan text as rendered, for audits and tests. */
export function planText(plan: LeadPlan): string {
  return [
    plan.intro, plan.closing, plan.byDate,
    ...plan.standing.map((s) => `${s.label} ${s.value}`),
    ...plan.topSkus.map((s) => s.revenue), ...plan.topQueries.map((q) => q.clicks), ...plan.channelMix.map((c) => c.share),
    ...plan.gaps.flatMap((g) => [g.title, g.now, g.benchmark, g.impact, g.why]),
    plan.goal.statement, plan.goal.baseline, plan.goal.target, plan.goal.worth ?? '',
    ...plan.run, ...plan.terms.map((t) => `${t.value} ${t.why}`),
  ].join('\n');
}

/** Numbers on the plan that do not trace back to the snapshots. Empty means the plan is honest. */
export function unsourcedNumbers(audit: Audit, plan: LeadPlan): string[] {
  const ok = allowedNumbers(audit, plan);
  return numbersIn(planText(plan)).filter((n) => !ok.has(n));
}
