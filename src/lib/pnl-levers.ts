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

export type PnlLeverHit = {
  category: PnlLeverCategory;
  lever: string;
  reasoning: string;
};

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
