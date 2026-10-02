import type { SupabaseClient } from '@supabase/supabase-js';
import { brandClient, brandMetrics, addDays, type LiveBrand, type Metrics, type Period } from './retail-os-portfolio';

// The org board (/retail-os/admin/org): members from case-study/ORG-SOP.md, their latest
// status rows, and the founder's daily planner. Every number is read from its source or
// shown as "no data" with the reason. Nothing is estimated.

export type OrgKind = 'founder' | 'cofounder' | 'ceo' | 'brand_ceo' | 'function' | 'person' | 'board_seat';
export type OrgStatus = 'on_track' | 'blocked' | 'needs_help' | 'done';
export const STATUSES: OrgStatus[] = ['on_track', 'blocked', 'needs_help', 'done'];
export const STATUS_LABEL: Record<OrgStatus | 'none', string> = { on_track: 'On track', blocked: 'Blocked', needs_help: 'Needs help', done: 'Done', none: 'Not reported' };

export type OrgMember = { id: string; name: string; role: string; kind: OrgKind; reports_to: string | null; owns: string[]; may_decide: string | null; must_escalate: string | null; brand_key: string | null; active: boolean; sort: number };
export type OrgUpdate = { id?: string; member_id: string; at: string; status: OrgStatus | null; summary: string; pending: string[]; stuck_on: string | null; help_needed: string | null; next_step: string | null; links: string[] };
export type OrgNode = OrgMember & { latest: OrgUpdate | null; history: OrgUpdate[]; children: OrgNode[] };

// ── Pure helpers (unit-tested) ────────────────────────────────────────────

/** Updates grouped per member, newest first, at most `keep` each. */
export function updatesByMember(updates: OrgUpdate[], keep = 7): Map<string, OrgUpdate[]> {
  const out = new Map<string, OrgUpdate[]>();
  const sorted = [...updates].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const u of sorted) {
    const list = out.get(u.member_id) ?? [];
    if (list.length < keep) list.push(u);
    out.set(u.member_id, list);
  }
  return out;
}

/** The newest update for a member, or null. */
export function latestStatus(updates: OrgUpdate[], memberId: string): OrgUpdate | null {
  let best: OrgUpdate | null = null;
  for (const u of updates) if (u.member_id === memberId && (!best || Date.parse(u.at) > Date.parse(best.at))) best = u;
  return best;
}

/** Tree from reports_to. Members whose boss is missing become roots. Children sorted by `sort`. */
export function buildTree(members: OrgMember[], updates: OrgUpdate[]): OrgNode[] {
  const hist = updatesByMember(updates);
  const nodes = new Map<string, OrgNode>(members.map((m) => [m.id, { ...m, latest: hist.get(m.id)?.[0] ?? null, history: hist.get(m.id) ?? [], children: [] }]));
  const roots: OrgNode[] = [];
  for (const n of nodes.values()) {
    const boss = n.reports_to ? nodes.get(n.reports_to) : undefined;
    if (boss && boss.id !== n.id) boss.children.push(n); else roots.push(n);
  }
  const sortRec = (list: OrgNode[]) => { list.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)); list.forEach((c) => sortRec(c.children)); };
  sortRec(roots);
  return roots;
}

/** Depth-first list with depth, for the stacked phone view. */
export function flatten(roots: OrgNode[], depth = 0): { node: OrgNode; depth: number }[] {
  return roots.flatMap((n) => [{ node: n, depth }, ...flatten(n.children, depth + 1)]);
}

/** Validates an incoming status row. Returns the clean row or an error. */
export function parseUpdate(body: unknown, memberIds: Set<string>): { ok: true; row: Omit<OrgUpdate, 'at' | 'id'> } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 600) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 300)).slice(0, 20) : []);
  const member_id = str(b.member_id, 20);
  if (!member_id || !memberIds.has(member_id)) return { ok: false, error: 'member_id must be an org_members id (e.g. TC-01)' };
  const status = b.status == null ? null : (STATUSES as string[]).includes(String(b.status)) ? (b.status as OrgStatus) : undefined;
  if (status === undefined) return { ok: false, error: `status must be one of ${STATUSES.join(', ')}` };
  const summary = str(b.summary);
  if (!summary) return { ok: false, error: 'summary is required' };
  const links = arr(b.links).filter((l) => /^https?:\/\//.test(l));
  return { ok: true, row: { member_id, status, summary, pending: arr(b.pending), stuck_on: str(b.stuck_on), help_needed: str(b.help_needed), next_step: str(b.next_step), links } };
}

// ── Loaders ───────────────────────────────────────────────────────────────

export const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export async function loadOrg(sb: SupabaseClient): Promise<{ members: OrgMember[]; updates: OrgUpdate[]; error: string | null }> {
  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const [m, u] = await Promise.all([
    sb.from('org_members').select('*').order('sort'),
    sb.from('org_updates').select('*').gte('at', since).order('at', { ascending: false }).limit(1000),
  ]);
  return { members: (m.data ?? []) as OrgMember[], updates: (u.data ?? []) as OrgUpdate[], error: m.error?.message ?? u.error?.message ?? null };
}

export type HealthRun = { at: string; failed: number; report: { brand: string; failed: number; results: { check: string; ok: boolean; detail: string }[] }[] };
export async function latestHealth(sb: SupabaseClient): Promise<HealthRun | null> {
  const { data, error } = await sb.from('health_runs').select('at, failed, report').order('at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const r = data as { at: string; failed: number; report: unknown };
  const rep = (r.report as { report?: HealthRun['report'] })?.report ?? (Array.isArray(r.report) ? (r.report as HealthRun['report']) : []);
  return { at: r.at, failed: r.failed, report: rep };
}

// ── Money per brand ───────────────────────────────────────────────────────

export type Cell = { value: number; note?: string } | { value: null; missing: string };
export type BrandMoney = { key: string; name: string; today: Cell; mtd: Cell; lastMonth: Cell; contribution: Cell; ebitda: Cell };

export function plannerPeriods(today: string): { today: Period; mtd: Period; lastMonth: Period } {
  const monthStart = today.slice(0, 8) + '01';
  const prevStart = (() => { const [y, m] = monthStart.split('-').map(Number); return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`; })();
  return {
    today: { key: 'daily', label: 'Today', start: today, end: addDays(today, 1) },
    mtd: { key: 'mtd', label: 'Month to date', start: monthStart, end: addDays(today, 1) },
    lastMonth: { key: 'monthly', label: 'Last month', start: prevStart, end: monthStart },
  };
}

/** Contribution profit and EBITDA from real inputs only (pure). */
export function profitCells(m: Metrics | null, hasExpenses: boolean | null): { contribution: Cell; ebitda: Cell } {
  if (!m) return { contribution: { value: null, missing: 'orders could not be read' }, ebitda: { value: null, missing: 'orders could not be read' } };
  if (!m.costVerified) {
    const missing = 'no product cost set (COGS_PER_UNIT_RUPEES in the store settings)';
    return { contribution: { value: null, missing }, ebitda: { value: null, missing } };
  }
  const contribution = m.netSales - m.cogs - m.adSpend - m.whatsappCost - m.barterValue;
  return {
    contribution: { value: contribution, note: 'net sales − product cost − ads − WhatsApp − barter' },
    ebitda: hasExpenses ? { value: m.netProfit, note: 'contribution − expenses table' } : { value: null, missing: 'no expenses table in the store, so overheads are unknown' },
  };
}

export async function loadBrandMoney(b: LiveBrand, p: ReturnType<typeof plannerPeriods>): Promise<BrandMoney> {
  const db = brandClient(b);
  const [t, mtd, lm, exp] = await Promise.all([
    withTimeout(brandMetrics(b, p.today), 20_000), withTimeout(brandMetrics(b, p.mtd), 20_000), withTimeout(brandMetrics(b, p.lastMonth), 20_000),
    withTimeout((async () => { const r = await db.from('expenses').select('id', { count: 'exact', head: true }); return !r.error; })(), 8_000),
  ]);
  const rev = (m: Metrics | null): Cell => (m ? { value: m.netSales } : { value: null, missing: 'orders could not be read' });
  return { key: b.key, name: b.name, today: rev(t), mtd: rev(mtd), lastMonth: rev(lm), ...profitCells(mtd, exp) };
}
