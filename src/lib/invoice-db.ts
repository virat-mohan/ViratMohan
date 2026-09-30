// Server side of DevShop invoices: settings, numbering, issuing, and suggesting the base figure
// (sales from the brand's own store, profit pool from weekly settlements) for a period.
import type { SupabaseClient } from '@supabase/supabase-js';
import { financialYear, invoiceNumber, missingFields, priceInvoice, addDaysYmd, type Draft, type Settings } from './invoice';
import { getLiveBrands, brandMetrics } from './retail-os-portfolio';

export type InvoiceRow = {
  id: string; number: string; fy: string; seq: number; token: string; brand_id: string | null; bill_to: Draft['billTo'];
  issue_date: string; due_date: string; period_start: string | null; period_end: string | null; lines: ReturnType<typeof priceInvoice>['lines'];
  subtotal: number; tax_rate: number; tax: number; total: number; issuer: Settings; status: 'draft' | 'issued' | 'paid' | 'void';
  paid_at: string | null; paid_reference: string | null; notes: string | null; created_at: string;
};

export const SETTINGS_FIELDS: (keyof Settings)[] = ['issuer_name', 'address', 'email', 'phone', 'pan', 'gstin', 'gst_rate', 'bank_name', 'account_name', 'account_no', 'ifsc', 'account_type', 'upi_id', 'payment_terms_days', 'footer_note'];

export async function getSettings(sb: SupabaseClient): Promise<Settings> {
  const { data, error } = await sb.from('invoice_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? {}) as Settings;
}

export async function saveSettings(sb: SupabaseClient, patch: Partial<Record<keyof Settings, unknown>>) {
  const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  for (const k of SETTINGS_FIELDS) if (k in patch) {
    const v = patch[k];
    row[k] = v === '' || v == null ? null : k === 'gst_rate' || k === 'payment_terms_days' ? Number(v) : String(v).trim().slice(0, 500);
  }
  if (typeof row.pan === 'string') row.pan = row.pan.toUpperCase();
  if (typeof row.ifsc === 'string') row.ifsc = row.ifsc.toUpperCase();
  const { error } = await sb.from('invoice_settings').upsert(row);
  if (error) throw new Error(error.message);
}

/** Issue an invoice: validate, price, take the next number in the financial year, freeze issuer details. */
export async function issueInvoice(sb: SupabaseClient, d: Draft & { brandId?: string | null }): Promise<{ ok: true; invoice: InvoiceRow } | { ok: false; missing: string[] }> {
  const settings = await getSettings(sb);
  const missing = missingFields(settings, d);
  if (missing.length) return { ok: false, missing };
  const priced = priceInvoice(d, settings);
  const fy = financialYear(d.issueDate);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: seq, error: e1 } = await sb.rpc('next_invoice_seq', { p_fy: fy });
    if (e1) throw new Error(e1.message);
    const { data, error } = await sb.from('invoices').insert({
      number: invoiceNumber(fy, seq as number), fy, seq, brand_id: d.brandId ?? null, bill_to: d.billTo,
      issue_date: d.issueDate, due_date: addDaysYmd(d.issueDate, settings.payment_terms_days ?? 7),
      period_start: d.periodStart || null, period_end: d.periodEnd || null,
      lines: priced.lines, subtotal: priced.subtotal, tax_rate: priced.taxRate, tax: priced.tax, total: priced.total,
      issuer: settings, status: 'issued', notes: d.notes?.trim() || null,
    }).select('*').single();
    if (!error) return { ok: true, invoice: data as InvoiceRow };
    if (!/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  throw new Error('Could not take an invoice number; try again.');
}

export async function listInvoices(sb: SupabaseClient, limit = 100): Promise<InvoiceRow[]> {
  const { data, error } = await sb.from('invoices').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceRow[];
}

export async function invoiceByToken(sb: SupabaseClient, token: string): Promise<InvoiceRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await sb.from('invoices').select('*').eq('token', token).maybeSingle();
  return data as InvoiceRow | null;
}

/** The figure a % line is charged on, where the system has it. Null with a reason when it doesn't. */
export async function suggestBase(sb: SupabaseClient, brand: { key: string; name: string }, basis: 'revenue_pct' | 'profit_pct', start: string, endInclusive: string): Promise<{ base: number | null; source: string }> {
  const end = addDaysYmd(endInclusive, 1);
  if (basis === 'profit_pct') {
    const { data } = await sb.from('settlements').select('profit_pool_paise, week_start, week_end').eq('brand_key', brand.key).gte('week_start', start).lt('week_start', end);
    const rows = (data ?? []) as { profit_pool_paise: number }[];
    if (rows.length) return { base: Math.round(rows.reduce((t, r) => t + Number(r.profit_pool_paise), 0)) / 100, source: `${rows.length} weekly settlement${rows.length === 1 ? '' : 's'} in the period` };
  }
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const live = getLiveBrands().find((b) => b.key === brand.key || norm(b.name) === norm(brand.name) || brand.key.startsWith(norm(b.key)));
  if (!live) return { base: null, source: 'This store is not connected for reporting; enter the figure.' };
  try {
    const m = await brandMetrics(live, { key: 'monthly', label: '', start, end });
    if (basis === 'revenue_pct') return { base: m.netSales, source: `Net sales from the ${live.name} store` };
    return { base: Math.max(0, m.netProfit), source: `Net profit from the ${live.name} store (no settlements recorded for the period)` };
  } catch (e) {
    return { base: null, source: `Could not read the store: ${(e as Error).message.slice(0, 120)}` };
  }
}
