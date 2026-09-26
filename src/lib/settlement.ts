// Weekly settlement: a pure library. No I/O, no clock reads (pass `now`).
// Given a brand's unsettled ledger entries and its signed terms, it:
//   1. reconciles every order against gateway settlements and courier COD
//      remittances, flagging differences over tolerance instead of guessing,
//   2. defers orders whose money is not due yet, and keeps review-queue rows out,
//   3. computes the statement lines, the platform share and the brand payout,
//   4. decides whether the payout must be held and why.
// All money is integer paise.
import { createHash } from 'node:crypto';

export type Model = 'profit_share' | 'revenue_share' | 'retainer';

export type BrandTerms = {
  brandKey: string;
  brandName?: string;
  model: Model;
  ratePct: number | null; // profit_share: 40 standard; revenue_share: 15–20
  retainerPaise: number | null; // per month
  retainerDeductedFromSettlement: boolean;
  reimburseProductCost: boolean;
  matchTolerancePaise: number;
  codGraceDays: number;
  gatewayGraceDays: number;
  payoutFundAccountId: string | null;
  payoutAccountChangedAt: string | null;
};

export type EntryKind =
  | 'order_revenue' | 'refund' | 'rto' | 'shipping' | 'ad_spend' | 'payment_fee' | 'product_cost'
  | 'platform_share' | 'adjustment' | 'expense' | 'gateway_settlement' | 'cod_remittance' | 'payout';

export type ReviewStatus = 'posted' | 'needs_review' | 'duplicate' | 'rejected';

export type LedgerEntry = {
  id: string;
  kind: EntryKind;
  amountPaise: number; // always ≥ 0; direction comes from kind (and meta.sign for adjustments)
  occurredAt: string; // ISO
  orderId?: string | null;
  source: string;
  sourceId: string;
  description?: string | null;
  meta?: Record<string, unknown> | null;
  reviewStatus?: ReviewStatus;
};

export type Payment = 'prepaid' | 'cod' | 'partial_cod';

export type Mismatch = {
  orderId: string | null;
  channel: 'gateway' | 'cod';
  expectedPaise: number;
  receivedPaise: number;
  differencePaise: number;
  reason: 'missing' | 'amount_differs' | 'no_matching_order';
};

export type StatementLine = { key: string; label: string; amountPaise: number; count?: number };

export type HoldReason =
  | 'unmatched_amounts' | 'negative_balance' | 'payout_account_changed' | 'no_payout_account'
  | 'over_payout_cap' | 'over_weekly_cap' | 'cap_not_configured' | 'payout_failed';

export type SettlementResult = {
  brandKey: string;
  weekStart: string;
  weekEnd: string;
  status: 'reconciled' | 'held';
  holdReasons: HoldReason[];
  lines: StatementLine[];
  mismatches: Mismatch[];
  grossRevenuePaise: number;
  netRevenuePaise: number;
  costsPaise: number;
  profitPoolPaise: number;
  platformSharePaise: number;
  carryInPaise: number;
  payoutPaise: number;
  carryForwardPaise: number;
  includedEntryIds: string[];
  deferredEntryIds: string[]; // money not due yet — picked up by a later week
  reviewEntryIds: string[]; // waiting in the review queue — never paid out until posted
  entriesHash: string;
};

export type SettleInput = {
  terms: BrandTerms;
  entries: LedgerEntry[]; // every unsettled entry for the brand; later ones are ignored
  weekStart: string; // YYYY-MM-DD, Monday IST
  weekEnd: string; // YYYY-MM-DD, Sunday IST
  carryInPaise?: number; // ≤ 0, last week's negative balance
  now: Date;
};

const DAY = 86_400_000;
const IST_OFFSET = 330 * 60_000;
const PAYOUT_ACCOUNT_COOLDOWN = 72 * 3600_000;

/** Last instant of an IST calendar day, as epoch ms. */
export function istDayEnd(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - IST_OFFSET + DAY - 1;
}

/** The Monday–Sunday (IST) week that ended most recently before `now`. */
export function previousWeekIST(now: Date): { weekStart: string; weekEnd: string } {
  const ist = new Date(now.getTime() + IST_OFFSET);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  const thisMonday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - dow * DAY;
  const d = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { weekStart: d(thisMonday - 7 * DAY), weekEnd: d(thisMonday - DAY) };
}

function paymentOf(e: LedgerEntry): { payment: Payment; prepaid: number; cod: number } {
  const m = (e.meta ?? {}) as Record<string, unknown>;
  const payment = (m.payment as Payment) || 'prepaid';
  if (payment === 'cod') return { payment, prepaid: 0, cod: e.amountPaise };
  if (payment === 'partial_cod') {
    const prepaid = Number(m.prepaid_paise ?? 0);
    const cod = m.cod_paise != null ? Number(m.cod_paise) : e.amountPaise - prepaid;
    return { payment, prepaid, cod };
  }
  return { payment: 'prepaid', prepaid: e.amountPaise, cod: 0 };
}

const sum = (xs: LedgerEntry[]) => xs.reduce((a, e) => a + e.amountPaise, 0);

export function hashEntries(entries: LedgerEntry[]): string {
  const rows = entries
    .map((e) => `${e.id}|${e.kind}|${e.amountPaise}|${e.source}:${e.sourceId}`)
    .sort();
  return createHash('sha256').update(rows.join('\n')).digest('hex');
}

function weekContainsFirstOfMonth(weekStart: string): boolean {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  for (let i = 0; i < 7; i++) if (new Date(start + i * DAY).getUTCDate() === 1) return true;
  return false;
}

const pctLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

export function settleWeek(input: SettleInput): SettlementResult {
  const { terms, weekStart, weekEnd, now } = input;
  const carryIn = Math.min(0, Math.round(input.carryInPaise ?? 0));
  const cutoff = istDayEnd(weekEnd);
  const tol = terms.matchTolerancePaise;

  const inWindow = input.entries.filter((e) => Date.parse(e.occurredAt) <= cutoff);
  const reviewEntryIds = inWindow.filter((e) => e.reviewStatus === 'needs_review').map((e) => e.id);
  // Outputs of earlier runs are never inputs; review/duplicate/rejected rows never count.
  const live = inWindow.filter((e) => (e.reviewStatus ?? 'posted') === 'posted' && e.kind !== 'platform_share' && e.kind !== 'payout');

  // ── Reconcile orders against the money that actually arrived ─────────────
  const byOrder = new Map<string, LedgerEntry[]>();
  for (const e of live) if (e.orderId) byOrder.set(e.orderId, [...(byOrder.get(e.orderId) ?? []), e]);

  const mismatches: Mismatch[] = [];
  const deferredOrders = new Set<string>();

  for (const [orderId, es] of byOrder) {
    const revenue = es.filter((e) => e.kind === 'order_revenue');
    const gateway = sum(es.filter((e) => e.kind === 'gateway_settlement'));
    const cod = sum(es.filter((e) => e.kind === 'cod_remittance'));
    if (!revenue.length) {
      if (gateway) mismatches.push({ orderId, channel: 'gateway', expectedPaise: 0, receivedPaise: gateway, differencePaise: gateway, reason: 'no_matching_order' });
      if (cod) mismatches.push({ orderId, channel: 'cod', expectedPaise: 0, receivedPaise: cod, differencePaise: cod, reason: 'no_matching_order' });
      continue;
    }
    let expPrepaid = 0, expCod = 0;
    for (const r of revenue) { const p = paymentOf(r); expPrepaid += p.prepaid; expCod += p.cod; }
    // RTO: the parcel came back, so the COD part was never collected.
    const rto = sum(es.filter((e) => e.kind === 'rto'));
    expCod = Math.max(0, expCod - rto);
    const orderedAt = Math.min(...revenue.map((r) => Date.parse(r.occurredAt)));
    const age = now.getTime() - orderedAt;

    const check = (channel: 'gateway' | 'cod', expected: number, received: number, graceDays: number) => {
      if (expected === 0 && received === 0) return;
      if (received === 0) {
        if (age <= graceDays * DAY) deferredOrders.add(orderId); // not due yet: settle it in a later week
        else mismatches.push({ orderId, channel, expectedPaise: expected, receivedPaise: 0, differencePaise: -expected, reason: 'missing' });
        return;
      }
      const diff = received - expected;
      if (Math.abs(diff) > tol) mismatches.push({ orderId, channel, expectedPaise: expected, receivedPaise: received, differencePaise: diff, reason: 'amount_differs' });
    };
    check('gateway', expPrepaid, gateway, terms.gatewayGraceDays);
    check('cod', expCod, cod, terms.codGraceDays);
  }
  // Receipts with no order id at all cannot be matched.
  for (const e of live) {
    if (!e.orderId && (e.kind === 'gateway_settlement' || e.kind === 'cod_remittance')) {
      mismatches.push({ orderId: null, channel: e.kind === 'gateway_settlement' ? 'gateway' : 'cod', expectedPaise: 0, receivedPaise: e.amountPaise, differencePaise: e.amountPaise, reason: 'no_matching_order' });
    }
  }

  const included = live.filter((e) => !(e.orderId && deferredOrders.has(e.orderId)));
  const deferredEntryIds = live.filter((e) => e.orderId && deferredOrders.has(e.orderId)).map((e) => e.id);

  // ── Statement ─────────────────────────────────────────────────────────────
  const of = (k: EntryKind) => included.filter((e) => e.kind === k);
  const sales = sum(of('order_revenue'));
  const refunds = sum(of('refund'));
  const rto = sum(of('rto'));
  const shipping = sum(of('shipping'));
  const ads = sum(of('ad_spend'));
  const fees = sum(of('payment_fee'));
  const product = sum(of('product_cost'));
  const expenses = sum(of('expense'));
  const adjustments = of('adjustment').reduce((a, e) => a + (Number(e.meta?.sign) === -1 ? -e.amountPaise : e.amountPaise), 0);

  const netRevenue = sales - refunds - rto;
  const costs = shipping + ads + fees + product + expenses;
  const pool = netRevenue - costs + adjustments;

  let platformShare = 0;
  let shareLabel = '';
  if (terms.model === 'profit_share') {
    const rate = terms.ratePct ?? 0;
    platformShare = Math.round((Math.max(0, pool + carryIn) * rate) / 100);
    shareLabel = `My share (${pctLabel(rate)} of profit pool)`;
  } else if (terms.model === 'revenue_share') {
    const rate = terms.ratePct ?? 0;
    platformShare = Math.round((Math.max(0, netRevenue) * rate) / 100);
    shareLabel = `My share (${pctLabel(rate)} of revenue)`;
  } else {
    if (terms.retainerDeductedFromSettlement && weekContainsFirstOfMonth(weekStart)) platformShare = terms.retainerPaise ?? 0;
    shareLabel = 'Monthly retainer';
  }

  const reimbursed = terms.reimburseProductCost ? product : 0;
  const brandAmount = pool + carryIn - platformShare + reimbursed;
  const payout = Math.max(0, brandAmount);
  const carryForward = Math.min(0, brandAmount);

  const count = (k: EntryKind) => of(k).length;
  const lines: StatementLine[] = [
    { key: 'sales', label: 'Sales', amountPaise: sales, count: count('order_revenue') },
    { key: 'refunds', label: 'Returns & refunds', amountPaise: -refunds, count: count('refund') },
    { key: 'rto', label: 'Returned to origin (not delivered)', amountPaise: -rto, count: count('rto') },
    { key: 'product_cost', label: 'Product cost', amountPaise: -product },
    { key: 'shipping', label: 'Shipping', amountPaise: -shipping },
    { key: 'ad_spend', label: 'Ad spend', amountPaise: -ads },
    { key: 'payment_fee', label: 'Payment & platform fees', amountPaise: -fees },
    { key: 'expense', label: 'Other expenses', amountPaise: -expenses, count: count('expense') },
    { key: 'adjustment', label: 'Adjustments', amountPaise: adjustments, count: count('adjustment') },
  ].filter((l) => l.amountPaise !== 0 || l.key === 'sales');
  lines.push({ key: 'profit_pool', label: 'Profit pool', amountPaise: pool });
  if (carryIn) lines.push({ key: 'carry_in', label: 'Brought forward from last week', amountPaise: carryIn });
  if (platformShare || terms.model !== 'retainer') lines.push({ key: 'platform_share', label: shareLabel, amountPaise: -platformShare });
  if (reimbursed) lines.push({ key: 'product_cost_back', label: 'Product cost paid back to you', amountPaise: reimbursed });
  if (carryForward) lines.push({ key: 'carry_forward', label: 'Carried to next week', amountPaise: -carryForward });
  lines.push({ key: 'payout', label: 'Your payout', amountPaise: payout });

  // ── Holds ─────────────────────────────────────────────────────────────────
  const holdReasons: HoldReason[] = [];
  if (mismatches.length) holdReasons.push('unmatched_amounts');
  if (brandAmount < 0) holdReasons.push('negative_balance');
  if (payout > 0 && !terms.payoutFundAccountId) holdReasons.push('no_payout_account');
  if (terms.payoutAccountChangedAt && now.getTime() - Date.parse(terms.payoutAccountChangedAt) < PAYOUT_ACCOUNT_COOLDOWN) holdReasons.push('payout_account_changed');

  return {
    brandKey: terms.brandKey, weekStart, weekEnd,
    status: holdReasons.length ? 'held' : 'reconciled',
    holdReasons, lines, mismatches,
    grossRevenuePaise: sales, netRevenuePaise: netRevenue, costsPaise: costs, profitPoolPaise: pool,
    platformSharePaise: platformShare, carryInPaise: carryIn, payoutPaise: payout, carryForwardPaise: carryForward,
    includedEntryIds: included.map((e) => e.id), deferredEntryIds, reviewEntryIds,
    entriesHash: hashEntries(included),
  };
}

// ── Payout gate: dry-run, caps ──────────────────────────────────────────────
export type PayoutDecision = { brandKey: string; payoutPaise: number; action: 'pay' | 'would_pay' | 'hold' | 'nothing'; reasons: HoldReason[] };

export type PayoutGate = { enabled: boolean; perPayoutCapPaise: number | null; weeklyCapPaise: number | null };

/** Decide, across all brands this week, which payouts go out. Smallest first so one big payout can't block the rest. */
export function decidePayouts(results: Pick<SettlementResult, 'brandKey' | 'payoutPaise' | 'holdReasons'>[], gate: PayoutGate): PayoutDecision[] {
  let running = 0;
  const sorted = [...results].sort((a, b) => a.payoutPaise - b.payoutPaise || a.brandKey.localeCompare(b.brandKey));
  return sorted.map((r) => {
    if (r.holdReasons.length) return { brandKey: r.brandKey, payoutPaise: r.payoutPaise, action: 'hold', reasons: [...r.holdReasons] };
    if (r.payoutPaise <= 0) return { brandKey: r.brandKey, payoutPaise: 0, action: 'nothing', reasons: [] };
    if (gate.perPayoutCapPaise == null || gate.weeklyCapPaise == null) return { brandKey: r.brandKey, payoutPaise: r.payoutPaise, action: 'hold', reasons: ['cap_not_configured'] };
    if (r.payoutPaise > gate.perPayoutCapPaise) return { brandKey: r.brandKey, payoutPaise: r.payoutPaise, action: 'hold', reasons: ['over_payout_cap'] };
    if (running + r.payoutPaise > gate.weeklyCapPaise) return { brandKey: r.brandKey, payoutPaise: r.payoutPaise, action: 'hold', reasons: ['over_weekly_cap'] };
    running += r.payoutPaise;
    return { brandKey: r.brandKey, payoutPaise: r.payoutPaise, action: gate.enabled ? 'pay' : 'would_pay', reasons: [] };
  });
}

export const HOLD_REASON_TEXT: Record<HoldReason, string> = {
  unmatched_amounts: 'Money received does not match orders beyond tolerance',
  negative_balance: 'The week is negative; the balance is carried forward',
  payout_account_changed: 'Payout account changed in the last 72 hours',
  no_payout_account: 'No payout account on file',
  over_payout_cap: 'Above the per-payout cap',
  over_weekly_cap: 'Above the weekly total cap',
  cap_not_configured: 'Payout caps are not configured',
  payout_failed: 'The payout provider rejected the payout',
};

/** Stable idempotency key for one brand-week, safe to retry forever. */
export function payoutIdempotencyKey(brandKey: string, weekStart: string): string {
  return 'settle_' + createHash('sha256').update(`${brandKey}|${weekStart}`).digest('hex').slice(0, 32);
}

export const inrFromPaise = (p: number) => (p < 0 ? '− ' : '') + '₹' + (Math.abs(p) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
