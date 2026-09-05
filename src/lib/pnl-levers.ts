// Fixed P&L lever taxonomy — every intake query gets forced through this
// before anything gets built, per the product's own operating rule.
export const PNL_LEVERS = {
  revenue: [
    'new revenue line',
    'conversion rate',
    'average order value / ticket size',
    'retention & churn',
    'pricing & yield',
  ],
  cost: [
    'labor cost',
    'procurement / COGS',
    'operational overhead',
    'waste & shrinkage',
  ],
} as const;

export type PnlLeverCategory = keyof typeof PNL_LEVERS;

// Epistemic status — never let a number's provenance go unstated. Applied
// to the core figure inside a lever's reasoning, and reused for any other
// material business fact the diagnosis depends on.
export const EPISTEMIC_STATUSES = ['known', 'assumed', 'needs_confirmation'] as const;
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

export type PnlCalculationRow = {
  label: string; // e.g. "Inbound leads / month" — plain, no jargon
  value: string; // e.g. "~500 (assumed)" — the figure, with its own status noted inline if not known
};

export type PnlLeverHit = {
  category: PnlLeverCategory;
  lever: string;
  pnl_line_item: string; // the specific line, e.g. "support team headcount cost" — not just the lever category
  baseline_value: string; // the line item's value today, e.g. "60% abandonment" — decomposed out of `reasoning` (brief §13)
  target_value: string; // the projected value if the mechanism runs, e.g. "~55% abandonment"
  causal_mechanism: string; // one short phrase: how the Step 4 mechanism actually moves baseline -> target
  reasoning: string;
  plain_explanation: string; // one everyday sentence restating `reasoning` with no finance jargon — for the customer-facing document
  // A simple, visible hypothesis table showing exactly how the headline
  // number in plain_explanation was arrived at — 2-4 rows, inputs then
  // result. Never a new number not already implied by `reasoning`; this is
  // the same math shown as a table instead of buried in one sentence, so
  // "how did it get that number" always has a visible answer.
  calculation: PnlCalculationRow[];
  value_status: EpistemicStatus; // is the core number in `reasoning` known, assumed, or unconfirmed?
};

// Root-cause confidence — categorical, never a fabricated percentage. A
// diagnosis is a hypothesis until evidence says otherwise.
export const CONFIDENCE_LEVELS = [
  'strongly_supported',
  'reasonably_supported',
  'preliminary_hypothesis',
  'insufficient_evidence',
] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

// Validation statuses — a valid schema is not evidence the solution is
// correct. Every validation check reports one of these.
export const VALIDATION_STATUSES = ['pass', 'warning', 'block'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

// Business-function taxonomy used to walk from a raw problem statement down
// to a specific P&L line before ever picking a lever — the same path a CFO
// would use: which function owns this, which line on the P&L does that
// function's activity actually move, then which lever category and lever.
export const BUSINESS_FUNCTIONS = [
  'Growth (sales & marketing)',
  'Efficiency / Operations',
  'Finance',
  'Legal / Compliance',
  'Admin',
  'HR / People',
  'Tech / Engineering',
] as const;
