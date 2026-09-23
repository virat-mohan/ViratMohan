import { brandMetrics, brandBudget, leversFor, periodFor, type LiveBrand, type Metrics, type Budget, type Lever, type Period } from './retail-os-portfolio';
import { escapeHtml } from './retail-os-http';

export type ReportKind = 'daily' | 'weekly' | 'monthly' | 'mtd';
export const REPORT_KINDS: { key: ReportKind; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'mtd', label: 'Month to date' },
];

export type BrandReport = {
  brand: { key: string; name: string };
  kind: ReportKind;
  period: Period;
  previousPeriod: Period;
  current: Metrics;
  previous: Metrics;
  budget: Budget | null;
  levers: Lever[];
};

export async function buildBrandReport(brand: LiveBrand, kind: ReportKind): Promise<BrandReport> {
  const { current, previous } = periodFor(kind);
  const [cur, prev, budget] = await Promise.all([
    brandMetrics(brand, current),
    brandMetrics(brand, previous),
    brandBudget(brand, current).catch(() => null),
  ]);
  return { brand: { key: brand.key, name: brand.name }, kind, period: current, previousPeriod: previous, current: cur, previous: prev, budget, levers: leversFor(cur, budget) };
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const change = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / Math.abs(b)) * 100)}%` : '—');

type Row = { label: string; cur: string; prev: string; delta: string; budget: string; variance: string; bad?: boolean };

export function reportRows(r: BrandReport): Row[] {
  const c = r.current, p = r.previous, b = r.budget;
  const roas = (m: Metrics) => (m.adSpend ? m.netSales / m.adSpend : 0);
  const count = (x: number) => Math.round(x).toLocaleString('en-IN');
  const v = (actual: number, plan: number | undefined, fmt: (x: number) => string = inr, higherIsBetter = true) => {
    if (!plan) return { budget: '—', variance: '—', bad: false };
    const diff = actual - plan;
    return { budget: fmt(plan), variance: `${diff >= 0 ? '+' : ''}${Math.round((diff / Math.abs(plan)) * 100)}%`, bad: higherIsBetter ? diff < 0 : diff > 0 };
  };
  const rows: Row[] = [];
  rows.push({ label: 'Orders', cur: count(c.orders), prev: count(p.orders), delta: change(c.orders, p.orders), ...v(c.orders, b?.orders, count) });
  rows.push({ label: 'Net sales', cur: inr(c.netSales), prev: inr(p.netSales), delta: change(c.netSales, p.netSales), ...v(c.netSales, b?.revenue) });
  rows.push({ label: 'Average order value', cur: inr(c.aov), prev: inr(p.aov), delta: change(c.aov, p.aov), budget: b && b.orders ? inr(b.revenue / b.orders) : '—', variance: b && b.orders ? change(c.aov, b.revenue / b.orders) : '—', bad: !!(b && b.orders && c.aov < b.revenue / b.orders) });
  rows.push({ label: 'Ad spend', cur: inr(c.adSpend), prev: inr(p.adSpend), delta: change(c.adSpend, p.adSpend), ...v(c.adSpend, b?.adSpend, inr, false) });
  rows.push({ label: 'Return on ad spend', cur: roas(c) ? `${roas(c).toFixed(1)}×` : '—', prev: roas(p) ? `${roas(p).toFixed(1)}×` : '—', delta: change(roas(c), roas(p)), budget: '—', variance: '—' });
  rows.push({ label: 'Discounts', cur: inr(c.discounts), prev: inr(p.discounts), delta: change(c.discounts, p.discounts), budget: '—', variance: '—' });
  rows.push({ label: 'Refunds', cur: inr(c.refunds), prev: inr(p.refunds), delta: change(c.refunds, p.refunds), budget: '—', variance: '—' });
  rows.push({ label: 'Gross profit', cur: inr(c.grossProfit), prev: inr(p.grossProfit), delta: change(c.grossProfit, p.grossProfit), budget: '—', variance: '—' });
  rows.push({ label: 'Net profit', cur: inr(c.netProfit), prev: inr(p.netProfit), delta: change(c.netProfit, p.netProfit), ...v(c.netProfit, b?.profit) });
  return rows;
}

// Email-safe HTML (inline styles only). Also embedded as-is on the admin page.
export function renderReportHtml(r: BrandReport): string {
  const rows = reportRows(r);
  const th = 'style="text-align:right;padding:6px 8px;border-bottom:2px solid #1A1410;font-size:12px;"';
  const td = 'style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px;"';
  const tdl = 'style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px;font-weight:bold;"';
  const table = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px;font-family:Arial,sans-serif;">
<tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #1A1410;font-size:12px;"></th><th ${th}>${escapeHtml(r.period.label)}</th><th ${th}>${escapeHtml(r.previousPeriod.label)}</th><th ${th}>Change</th><th ${th}>Budget</th><th ${th}>vs budget</th></tr>
${rows.map((x) => `<tr><td ${tdl}>${escapeHtml(x.label)}</td><td ${td}>${escapeHtml(x.cur)}</td><td ${td}>${escapeHtml(x.prev)}</td><td ${td}>${escapeHtml(x.delta)}</td><td ${td}>${escapeHtml(x.budget)}</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px;${x.bad ? 'color:#B3261E;font-weight:bold;' : ''}">${escapeHtml(x.variance)}</td></tr>`).join('\n')}
</table>`;
  const budgetNote = r.budget ? '' : '<p style="font-family:Arial,sans-serif;font-size:12px;color:#666;">No business plan covers this period in the store, so there is no budget to compare against.</p>';
  const levers = r.levers.length
    ? `<h3 style="font-family:Arial,sans-serif;font-size:14px;margin:18px 0 6px;">Levers to pull</h3><ul style="font-family:Arial,sans-serif;font-size:13px;padding-left:18px;margin:0;">${r.levers.map((l) => `<li style="margin-bottom:6px;"><b>${escapeHtml(l.title)}.</b> ${escapeHtml(l.detail)}</li>`).join('')}</ul>`
    : '<p style="font-family:Arial,sans-serif;font-size:13px;">Nothing flagged this period.</p>';
  return `<h2 style="font-family:Arial,sans-serif;font-size:18px;margin:0 0 4px;">${escapeHtml(r.brand.name)}: ${escapeHtml(r.period.label)}</h2>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#666;margin:0 0 12px;">Net sales are after discounts and refunds. Profit uses the store's own cost per unit, expenses, Meta ad spend, WhatsApp messages and Pay With A Post value.</p>
${table}${budgetNote}${levers}`;
}
