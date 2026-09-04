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
