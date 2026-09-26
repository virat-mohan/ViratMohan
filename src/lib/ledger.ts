// Ledger row shape and double-entry account mapping shared by every importer
// (WhatsApp export, WhatsApp Cloud API, and later Shopify / Razorpay / Shiprocket)
// and by the weekly settlement job.
import { createClient } from '@supabase/supabase-js';
import type { EntryKind, LedgerEntry, ReviewStatus, BrandTerms } from './settlement';

export type LedgerRow = {
  id?: string;
  brand_key: string | null;
  kind: EntryKind;
  amount_paise: number;
  debit_account: string;
  credit_account: string;
  occurred_at: string;
  order_id?: string | null;
  source: string;
  source_id: string;
  description?: string | null;
  meta?: Record<string, unknown>;
  review_status?: ReviewStatus;
  tag_source?: string | null;
  tag_confidence?: number | null;
};

// Each posting moves money from credit to debit. Revenue-side kinds credit an
// income account; cost kinds debit an expense account; receipts clear the
// customer receivable into a clearing account for the gateway or courier.
const ACCOUNTS: Record<EntryKind, [debit: string, credit: string]> = {
  order_revenue: ['customer_receivable', 'revenue'],
  refund: ['revenue_returns', 'customer_receivable'],
  rto: ['revenue_returns', 'customer_receivable'],
  shipping: ['expense:shipping', 'payable'],
  ad_spend: ['expense:ads', 'payable'],
  payment_fee: ['expense:payment_fees', 'gateway_clearing'],
  product_cost: ['expense:product', 'payable'],
  expense: ['expense:other', 'payable'],
  platform_share: ['brand_payable', 'platform_income'],
  adjustment: ['adjustment', 'brand_payable'],
  gateway_settlement: ['gateway_clearing', 'customer_receivable'],
  cod_remittance: ['cod_clearing', 'customer_receivable'],
  payout: ['brand_payable', 'bank'],
};

export function accountsFor(kind: EntryKind, sign: 1 | -1 = 1): { debit_account: string; credit_account: string } {
  const [d, c] = ACCOUNTS[kind];
  return sign === 1 ? { debit_account: d, credit_account: c } : { debit_account: c, credit_account: d };
}

export function rowToEntry(r: LedgerRow & { id: string }): LedgerEntry {
  return {
    id: r.id, kind: r.kind, amountPaise: Number(r.amount_paise), occurredAt: r.occurred_at, orderId: r.order_id ?? null,
    source: r.source, sourceId: r.source_id, description: r.description ?? null, meta: r.meta ?? {}, reviewStatus: r.review_status ?? 'posted',
  };
}

export type BrandTermsRow = {
  brand_key: string; brand_name: string; model: BrandTerms['model']; rate_pct: number | null; retainer_paise: number | null;
  retainer_deducted_from_settlement: boolean; reimburse_product_cost: boolean; match_tolerance_paise: number;
  cod_grace_days: number; gateway_grace_days: number; payout_fund_account_id: string | null; payout_account_changed_at: string | null;
  statement_email: string | null; statement_whatsapp: string | null; whatsapp_group_names: string[]; product_keywords?: string[]; active: boolean;
};

export function termsFromRow(r: BrandTermsRow): BrandTerms {
  return {
    brandKey: r.brand_key, brandName: r.brand_name, model: r.model,
    ratePct: r.rate_pct == null ? null : Number(r.rate_pct), retainerPaise: r.retainer_paise == null ? null : Number(r.retainer_paise),
    retainerDeductedFromSettlement: r.retainer_deducted_from_settlement, reimburseProductCost: r.reimburse_product_cost,
    matchTolerancePaise: Number(r.match_tolerance_paise), codGraceDays: r.cod_grace_days, gatewayGraceDays: r.gateway_grace_days,
    payoutFundAccountId: r.payout_fund_account_id, payoutAccountChangedAt: r.payout_account_changed_at,
  };
}

export function serviceDb(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Insert rows, skipping any (source, source_id) already present. Returns how many were new. */
export async function insertLedgerRows(sb: ReturnType<typeof serviceDb>, rows: LedgerRow[]): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await sb.from('ledger_entries')
    .upsert(rows, { onConflict: 'source,source_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
