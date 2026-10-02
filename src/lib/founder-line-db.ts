// Live data and transport for the founder line (src/lib/founder-line.ts).
import { getEnv, type Env } from './env';
import { serviceDb } from './ledger';
import { sendWhatsAppCloud } from './notify';
import { getLiveBrands, istToday, addDays, type Period } from './retail-os-portfolio';
import { loadBrandRow, loadDevShopRow, buildNeedsYou, type DevShopRow } from './command-centre';
import { withTimeout } from './org-board';
import { FOUNDER_PHONE, sendToFounder, type FounderSnapshot, type MemberStatus } from './founder-line';

type Db = ReturnType<typeof serviceDb>;
const PRINCE_ID = '7ccc4990-12b8-424b-93cf-724645fbac69';

/** Latest status per active org member (org_updates newest row). */
export async function memberStatuses(sb: Db): Promise<MemberStatus[]> {
  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const [m, u] = await Promise.all([
    sb.from('org_members').select('id, name, active, kind, sort').eq('active', true).order('sort'),
    sb.from('org_updates').select('member_id, at, status, summary').gte('at', since).order('at', { ascending: false }).limit(1000),
  ]);
  const latest = new Map<string, { status: string | null; summary: string }>();
  for (const r of (u.data ?? []) as any[]) if (!latest.has(r.member_id)) latest.set(r.member_id, { status: r.status, summary: r.summary });
  return ((m.data ?? []) as any[]).filter((x) => x.kind !== 'founder').map((x) => ({ id: x.id, name: x.name, status: latest.get(x.id)?.status ?? null, summary: latest.get(x.id)?.summary ?? '' }));
}

export async function latestPriorities(sb: Db) {
  const { data } = await sb.from('org_updates').select('at, summary, pending, next_step').eq('member_id', 'DS-02').order('at', { ascending: false }).limit(1).maybeSingle();
  return (data as { at: string; summary: string; pending: string[]; next_step: string | null } | null) ?? null;
}

export async function queuedRequestCount(sb: Db): Promise<number | null> {
  const r = await sb.from('founder_requests').select('id', { count: 'exact', head: true }).eq('status', 'queued');
  return r.error ? null : r.count ?? 0;
}

/** Today and yesterday per live brand, unread, needs you, blocked agents, queued requests. */
export async function loadFounderSnapshot(env: Env, sb: Db = serviceDb(env)): Promise<FounderSnapshot> {
  const today = istToday();
  const cur: Period = { key: 'daily', label: 'Today', start: today, end: addDays(today, 1) };
  const prev: Period = { key: 'daily', label: 'Yesterday', start: addDays(today, -1), end: today };
  const emptyDev: DevShopRow = { unread: null, oldestUnreadAt: null, newLeads7d: null, postsReady: null, princeDueSoon: null, princeOverdue: null };
  const [rows, dev, members] = await Promise.all([
    Promise.all(getLiveBrands().map((b) => loadBrandRow(b, cur, prev).then((r) => ({ ...r, adminUrl: null })))),
    withTimeout(loadDevShopRow(sb, PRINCE_ID, today), 10_000),
    withTimeout(memberStatuses(sb), 8_000),
  ]);
  const d = dev ?? emptyDev;
  return {
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
    brands: rows.map((r) => ({ name: r.name, orders: r.orders, revenue: r.netSales, prevOrders: r.prevOrders, prevRevenue: r.prevNetSales, unread: r.unread, oldestUnreadAt: r.oldestUnreadAt })),
    devshopUnread: d.unread, devshopOldestUnreadAt: d.oldestUnreadAt,
    needs: buildNeedsYou(rows, d).slice(0, 5),
    blocked: (members ?? []).filter((m) => m.status === 'blocked'),
    queuedRequests: d.founderQueued ?? null,
  };
}

/** Free text inside 24h of Virat's last message; otherwise the approved template (FOUNDER_BRIEF_TEMPLATE_APPROVED=1). */
export function liveFounderSend(env: Env, sb: Db = serviceDb(env), sentBy = 'founder_brief') {
  return {
    now: new Date(),
    templateApproved: process.env.FOUNDER_BRIEF_TEMPLATE_APPROVED === '1',
    lastInboundAt: async () => {
      const { data } = await sb.from('whatsapp_messages').select('at').eq('contact_phone', FOUNDER_PHONE).eq('direction', 'in').order('at', { ascending: false }).limit(1).maybeSingle();
      return (data as { at: string } | null)?.at ?? null;
    },
    send: (to: string, text: string, template?: { name: string; lang: string; params: string[] }) => sendWhatsAppCloud(env, to, text, template),
    log: async (row: { body: string; status: string }) => {
      const { error } = await sb.from('whatsapp_messages').insert({ direction: 'out', contact_phone: FOUNDER_PHONE, contact_name: 'Virat', body: row.body, status: row.status, sent_by: sentBy, read_at: new Date().toISOString() });
      if (error) console.error('founder send log failed', error.message);
    },
  };
}

/** Immediate alert to Virat for an urgent customer issue. Same 24-hour / template rule. */
export async function founderAlert(text: string, env: Env = getEnv(), sb: Db = serviceDb(env)) {
  const label = 'Urgent ' + new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return sendToFounder(text.slice(0, 900), label, liveFounderSend(env, sb, 'founder_alert'));
}
