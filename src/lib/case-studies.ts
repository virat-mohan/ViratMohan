// Successful Case Studies (SCS), found automatically. Every day the scan compares each live
// brand's last 3 days with the 14 days before. A real lift becomes a draft on the founder
// console; Virat publishes or dismisses it. Public copy is percentages only: no brand name,
// no rupee amounts (client data is confidential).
import type { SupabaseClient } from '@supabase/supabase-js';
import { brandMetrics, addDays, istToday, type LiveBrand, type Period } from './retail-os-portfolio';

export const AFTER_DAYS = 3;
export const BEFORE_DAYS = 14;
export const MIN_LIFT_PCT = 25;
export const MIN_BEFORE_ORDERS = 5; // below this the "before" average means little
export const MIN_AFTER_ORDERS = 2;

export type Window = { orders: number; netSales: number; days: number };
export type Candidate = { lift_pct: number; before_orders: number; after_orders: number; headline: string; detail: string; base_note: string };

/** Pure: is this a case study worth showing Virat? Null when the base is too small or the lift too modest. */
export function detectCaseStudy(before: Window, after: Window): Candidate | null {
  if (before.orders < MIN_BEFORE_ORDERS || after.orders < MIN_AFTER_ORDERS || before.days <= 0 || after.days <= 0) return null;
  const b = before.netSales / before.days, a = after.netSales / after.days;
  if (b <= 0) return null;
  const lift = Math.round(((a - b) / b) * 100);
  if (lift < MIN_LIFT_PCT) return null;
  const small = before.orders + after.orders < 30;
  return {
    lift_pct: lift, before_orders: before.orders, after_orders: after.orders,
    headline: `+${lift}% sales per day in the last ${after.days} days`,
    detail: `Average sales per day over the last ${after.days} days, against the ${before.days} days before. Source: the brand's order database, non-cancelled orders.`,
    base_note: small ? 'Small base and early days: a few orders move this number a lot.' : 'Measured on a steady base of orders.',
  };
}

export type CaseStudyRow = {
  id: string; brand_key: string; brand_name: string; metric: string; lift_pct: number;
  before_start: string; before_end: string; after_start: string; after_end: string;
  before_orders: number; after_orders: number; headline: string; detail: string; base_note: string;
  status: 'draft' | 'published' | 'dismissed'; created_at: string; published_at: string | null;
};

const period = (start: string, end: string): Period => ({ key: 'daily', label: `${start} to ${end}`, start, end });

/** Daily: scan every live brand and park new drafts. Returns the drafts created, so the caller can tell Virat. */
export async function scanForCaseStudies(sb: SupabaseClient, brands: LiveBrand[], today = istToday()): Promise<CaseStudyRow[]> {
  const afterEnd = today, afterStart = addDays(today, -AFTER_DAYS), beforeStart = addDays(afterStart, -BEFORE_DAYS);
  const created: CaseStudyRow[] = [];
  for (const brand of brands) {
    try {
      // One study per brand per fortnight: a lift that is still running is the same story.
      const { data: recent } = await sb.from('case_studies').select('id').eq('brand_key', brand.key).neq('status', 'dismissed').gte('after_end', addDays(today, -BEFORE_DAYS)).limit(1);
      if (recent?.length) continue;
      const [b, a] = await Promise.all([brandMetrics(brand, period(beforeStart, afterStart)), brandMetrics(brand, period(afterStart, afterEnd))]);
      const c = detectCaseStudy({ orders: b.orders, netSales: b.netSales, days: BEFORE_DAYS }, { orders: a.orders, netSales: a.netSales, days: AFTER_DAYS });
      if (!c) continue;
      const { data, error } = await sb.from('case_studies').upsert({
        brand_key: brand.key, brand_name: brand.name, metric: 'sales_per_day', ...c,
        before_start: beforeStart, before_end: afterStart, after_start: afterStart, after_end: afterEnd,
      }, { onConflict: 'brand_key,metric,after_end', ignoreDuplicates: true }).select('*').maybeSingle();
      if (error) throw new Error(error.message);
      if (data) created.push(data as CaseStudyRow);
    } catch (e) {
      console.error('case study scan failed', brand.key, e);
    }
  }
  return created;
}

export async function listCaseStudies(sb: SupabaseClient, status?: CaseStudyRow['status']): Promise<CaseStudyRow[]> {
  let q = sb.from('case_studies').select('*').order('created_at', { ascending: false }).limit(50);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CaseStudyRow[];
}

/** What the public sees: the copy, never the brand. */
export const publicView = (c: CaseStudyRow) => ({ id: c.id, lift_pct: c.lift_pct, headline: c.headline, detail: c.detail, base_note: c.base_note, published_at: c.published_at });
