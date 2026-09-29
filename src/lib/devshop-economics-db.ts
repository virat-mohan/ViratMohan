// Stage 5D — persistence for Custom Build economics. Thin store over the three dedicated tables
// (migration 0044); all arithmetic stays in the pure engine (devshop-economics.ts). Service-role
// access only, behind admin auth at the route. No pricing, no rates, no overhead allocation.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DELIVERY_ROLES, WORK_CATEGORIES, projectContribution, hoursByRole, hoursByCategory,
  totalHours, founderHours, amcMonthlyEconomics,
  type WorkLogEntry, type DirectCost, type ProjectRevenue, type RevenueBasis, type DeliveryRole, type WorkCategory,
} from './devshop-economics';

const isRole = (r: string): r is DeliveryRole => (DELIVERY_ROLES as readonly string[]).includes(r);
const isCategory = (c: string): c is WorkCategory => (WORK_CATEGORIES as readonly string[]).includes(c);

export type WorklogInput = { workDate: string; role: string; hours: number; category: string; note?: string | null };
export type CostInput = { amountPaise: number; category: string; attribution?: 'direct' | 'shared' | 'overhead'; source: string; isActual?: boolean; incurredOn?: string | null };
export type RevenueInput = { contractedPaise?: number | null; invoicedPaise?: number | null; collectedPaise?: number | null };

/** Validation shared by the route. Returns an error string, or null when valid. */
export function validateWorklog(w: WorklogInput): string | null {
  if (!isRole(w.role)) return `unknown role "${w.role}"`;
  if (!isCategory(w.category)) return `unknown category "${w.category}"`;
  if (!(w.hours > 0)) return 'hours must be positive';
  if (!w.workDate) return 'workDate is required';
  return null;
}
export function validateCost(c: CostInput): string | null {
  if (!(c.amountPaise >= 0)) return 'amountPaise must be >= 0';
  if (!c.category?.trim()) return 'category is required';
  if (!c.source?.trim()) return 'source is required';
  if (c.attribution && !['direct', 'shared', 'overhead'].includes(c.attribution)) return `bad attribution "${c.attribution}"`;
  return null;
}

export function economicsStore(sb: SupabaseClient, operator = 'admin') {
  return {
    async addWorklog(submissionId: string, w: WorklogInput) {
      const { error } = await sb.from('custom_build_worklog').insert({
        submission_id: submissionId, work_date: w.workDate, role: w.role, hours: w.hours, category: w.category,
        note: w.note ?? null, entered_by: operator,
      });
      if (error) throw new Error(`worklog insert: ${error.message}`);
    },
    async addCost(submissionId: string, c: CostInput) {
      const { error } = await sb.from('custom_build_costs').insert({
        submission_id: submissionId, amount_paise: c.amountPaise, category: c.category,
        attribution: c.attribution ?? 'direct', source: c.source, is_actual: c.isActual ?? true,
        incurred_on: c.incurredOn ?? null, entered_by: operator,
      });
      if (error) throw new Error(`cost insert: ${error.message}`);
    },
    /** Upsert revenue; only provided bases are changed — a null/omitted basis never overwrites an existing value. */
    async setRevenue(submissionId: string, r: RevenueInput) {
      const patch: Record<string, unknown> = { submission_id: submissionId, updated_by: operator, updated_at: new Date().toISOString() };
      if (r.contractedPaise != null) patch.contracted_paise = r.contractedPaise;
      if (r.invoicedPaise != null) patch.invoiced_paise = r.invoicedPaise;
      if (r.collectedPaise != null) patch.collected_paise = r.collectedPaise;
      const { error } = await sb.from('custom_build_revenue').upsert(patch, { onConflict: 'submission_id' });
      if (error) throw new Error(`revenue upsert: ${error.message}`);
    },
    async load(submissionId: string): Promise<{ log: WorkLogEntry[]; costs: DirectCost[]; revenue: ProjectRevenue }> {
      const [{ data: wl }, { data: cs }, { data: rev }] = await Promise.all([
        sb.from('custom_build_worklog').select('work_date, role, hours, category, note').eq('submission_id', submissionId),
        sb.from('custom_build_costs').select('amount_paise, category, attribution, source, is_actual').eq('submission_id', submissionId),
        sb.from('custom_build_revenue').select('contracted_paise, invoiced_paise, collected_paise').eq('submission_id', submissionId).maybeSingle(),
      ]);
      const log: WorkLogEntry[] = (wl ?? []).map((r: any) => ({ date: r.work_date, role: r.role, hours: Number(r.hours), category: r.category, note: r.note }));
      const costs: DirectCost[] = (cs ?? []).map((r: any) => ({ amountPaise: Number(r.amount_paise), category: r.category, attribution: r.attribution, source: r.source, actual: r.is_actual }));
      const revenue: ProjectRevenue = rev ? { contractedPaise: rev.contracted_paise, invoicedPaise: rev.invoiced_paise, collectedPaise: rev.collected_paise } : {};
      return { log, costs, revenue };
    },
    /** Computed economics for a build, on the default 'collected' basis (labour cost stays UNKNOWN — no rates). */
    async compute(submissionId: string, basis: RevenueBasis = 'collected') {
      const { log, costs, revenue } = await this.load(submissionId);
      return {
        revenue,
        hoursByRole: hoursByRole(log),
        hoursByCategory: hoursByCategory(log),
        totalHours: totalHours(log),
        founderHours: founderHours(log),
        contribution: projectContribution(revenue, costs, log, { basis }), // no ratePaisePerHour → before-labour
        labourCost: 'UNKNOWN — no authoritative per-role rates',
      };
    },
    /** AMC monthly economics reuse the same worklog/cost tables (SUPPORT-category hours; costs tagged as the caller chooses). */
    amcMonth: amcMonthlyEconomics,
  };
}
