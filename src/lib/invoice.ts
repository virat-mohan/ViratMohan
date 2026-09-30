// DevShop invoices: the pure parts. Financial year and numbering, line items from a billing
// basis (fixed fee, retainer, % of sales, % of profit pool, deposit, add-ons), totals, amount in
// words, and what is still missing before an invoice can be issued. No network, no database.

export type Basis = 'fixed' | 'retainer' | 'revenue_pct' | 'profit_pct' | 'deposit' | 'reimbursement';
export const BASIS_LABEL: Record<Basis, string> = {
  fixed: 'Fixed fee', retainer: 'Monthly retainer', revenue_pct: '% of sales', profit_pct: '% of profit pool',
  deposit: 'Onboarding deposit', reimbursement: 'Reimbursement at cost',
};

export type LineInput = { basis: Basis; description?: string; amount?: number | null; pct?: number | null; base?: number | null };
export type Line = { basis: Basis; description: string; detail: string; base: number | null; pct: number | null; amount: number };

export type Settings = {
  issuer_name: string | null; address: string | null; email: string | null; phone: string | null; pan: string | null;
  gstin: string | null; gst_rate: number | null; bank_name: string | null; account_name: string | null; account_no: string | null;
  ifsc: string | null; account_type: string | null; upi_id: string | null; payment_terms_days: number | null; footer_note: string | null;
};
export type BillTo = { name?: string; company?: string; address?: string; gstin?: string; email?: string };
export type Draft = { billTo: BillTo; issueDate: string; periodStart?: string | null; periodEnd?: string | null; lines: LineInput[]; notes?: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const inr = (n: number) => '₹' + r2(n).toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** Indian financial year for a date: 2026-09-30 → '26-27'; 2027-02-01 → '26-27'. */
export function financialYear(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
export const invoiceNumber = (fy: string, seq: number) => `DS/${fy}/${String(seq).padStart(4, '0')}`;

const monthName = (ymd?: string | null) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
const shortDate = (ymd?: string | null) => (ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
export const periodText = (a?: string | null, b?: string | null) => (a && b ? `${shortDate(a)} to ${shortDate(b)}` : a ? `from ${shortDate(a)}` : '');

/** Turn one input line into a priced line with a plain description. Throws a readable message when a figure is missing. */
export function priceLine(l: LineInput, period: { start?: string | null; end?: string | null } = {}): Line {
  const per = periodText(period.start, period.end);
  const need = (v: number | null | undefined, what: string) => { if (v == null || !Number.isFinite(Number(v)) || Number(v) < 0) throw new Error(what); return Number(v); };
  switch (l.basis) {
    case 'retainer': {
      const amount = need(l.amount, 'Retainer amount is missing');
      return { basis: l.basis, description: l.description || `DevShop Retail OS retainer${period.start ? `, ${monthName(period.start)}` : ''}`, detail: per ? `Social and performance marketing, ${per}` : 'Monthly retainer', base: null, pct: null, amount: r2(amount) };
    }
    case 'revenue_pct': {
      const pct = need(l.pct, 'Revenue share % is missing'); const base = need(l.base, 'Sales for the period are missing');
      return { basis: l.basis, description: l.description || `Revenue share at ${pct}% of sales`, detail: `${pct}% of ${inr(base)} net sales${per ? `, ${per}` : ''}`, base, pct, amount: r2((base * pct) / 100) };
    }
    case 'profit_pct': {
      const pct = need(l.pct, 'Profit share % is missing'); const base = need(l.base, 'Profit pool for the period is missing');
      return { basis: l.basis, description: l.description || `DevShop share of the profit pool at ${pct}%`, detail: `${pct}% of ${inr(base)} profit pool${per ? `, ${per}` : ''}`, base, pct, amount: r2((base * pct) / 100) };
    }
    case 'deposit': {
      const amount = need(l.amount ?? 5000, 'Deposit amount is missing');
      return { basis: l.basis, description: l.description || 'Retail OS onboarding deposit', detail: 'Fully adjusted against actual onboarding tech costs; DevShop keeps none of it', base: null, pct: null, amount: r2(amount) };
    }
    case 'reimbursement': {
      const amount = need(l.amount, 'Reimbursement amount is missing');
      return { basis: l.basis, description: l.description || 'Costs reimbursed at cost', detail: per || 'At cost, receipts on request', base: null, pct: null, amount: r2(amount) };
    }
    default: {
      const amount = need(l.amount, 'Fee amount is missing');
      if (!l.description?.trim()) throw new Error('Describe the fixed fee');
      return { basis: 'fixed', description: l.description.trim(), detail: per, base: null, pct: null, amount: r2(amount) };
    }
  }
}

export type Priced = { lines: Line[]; subtotal: number; taxRate: number; tax: number; total: number };

export function priceInvoice(d: Draft, s: Pick<Settings, 'gstin' | 'gst_rate'>): Priced {
  const lines = d.lines.map((l) => priceLine(l, { start: d.periodStart, end: d.periodEnd }));
  const subtotal = r2(lines.reduce((t, l) => t + l.amount, 0));
  const taxRate = s.gstin && s.gst_rate ? Number(s.gst_rate) : 0;
  const tax = r2((subtotal * taxRate) / 100);
  return { lines, subtotal, taxRate, tax, total: r2(subtotal + tax) };
}

/** What is still needed before an invoice can be issued, in plain words, so the caller can ask for it. */
export function missingFields(s: Settings, d: Partial<Draft>): string[] {
  const miss: string[] = [];
  const need: [keyof Settings, string][] = [['issuer_name', 'Your name as issuer'], ['address', 'Your address'], ['pan', 'Your PAN'], ['account_name', 'Bank account name'], ['account_no', 'Bank account number'], ['ifsc', 'IFSC code']];
  for (const [k, label] of need) if (!s[k] || !String(s[k]).trim()) miss.push(`${label} (Invoice settings)`);
  if (!d.billTo?.name?.trim() && !d.billTo?.company?.trim()) miss.push('Who the invoice is for');
  if (!d.billTo?.address?.trim()) miss.push("The client's billing address");
  if (!d.issueDate) miss.push('Invoice date');
  if (!d.lines?.length) miss.push('At least one line');
  for (const [i, l] of (d.lines ?? []).entries()) {
    try { priceLine(l, { start: d.periodStart, end: d.periodEnd }); } catch (e) { miss.push(`Line ${i + 1}: ${(e as Error).message}`); }
    if ((l.basis === 'revenue_pct' || l.basis === 'profit_pct' || l.basis === 'retainer') && !d.periodStart) { miss.push('The period this invoice covers'); break; }
  }
  return [...new Set(miss)];
}

// ── Amount in words, Indian system (lakh, crore) ────────────────────────────
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function under1000(n: number): string {
  const h = Math.floor(n / 100), rest = n % 100;
  const t = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? '-' + ONES[rest % 10] : ''}`;
  return [h ? `${ONES[h]} hundred` : '', t].filter(Boolean).join(' ');
}
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount), paise = Math.round((amount - rupees) * 100);
  if (!rupees && !paise) return 'Zero rupees only';
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7), lakh = Math.floor((rupees % 1e7) / 1e5), thousand = Math.floor((rupees % 1e5) / 1e3), rest = rupees % 1e3;
  if (crore) parts.push(`${under1000(crore)} crore`);
  if (lakh) parts.push(`${under1000(lakh)} lakh`);
  if (thousand) parts.push(`${under1000(thousand)} thousand`);
  if (rest) parts.push(under1000(rest));
  let s = `${parts.join(' ')} rupees`;
  if (paise) s += ` and ${under1000(paise)} paise`;
  s += ' only';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const addDaysYmd = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
