import type { SupabaseClient } from '@supabase/supabase-js';
import { brandClient, brandMetrics, type LiveBrand, type Period } from './retail-os-portfolio';

// The founder console's Command Centre: one row per live brand in the same
// shape, a DevShop row, and a "Needs you" list limited to what AGENT-ORG.md
// says comes to Virat. Every cell is either a real number read from its
// source or null ("no data"). Nothing is estimated.

const istStart = (ymd: string) => `${ymd}T00:00:00+05:30`;
const HOUR = 3600_000;

export type BrandRow = {
  key: string; name: string;
  orders: number | null; prevOrders: number | null;
  netSales: number | null; prevNetSales: number | null;
  adSpend: number | null; costPerOrder: number | null;
  checkout: { started: number; paid: number; source: string } | null;
  unread: number | null; oldestUnreadAt: string | null; // WhatsApp inbox (whatsapp_conversations.unread_count)
  paidNotShipped: number | null; // paid, not cancelled, no AWB, older than 24h
  error: string | null;
};

export type DevShopRow = {
  unread: number | null; oldestUnreadAt: string | null;
  newLeads7d: number | null;
  postsReady: number | null;
  princeDueSoon: number | null; princeOverdue: number | null;
};

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

/** Checkout→paid: orders with payment_status (pending + paid) first, else InitiateCheckout vs Purchase events. */
async function checkoutRate(db: SupabaseClient, p: Period): Promise<BrandRow['checkout']> {
  const from = istStart(p.start), to = istStart(p.end);
  const all = await db.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to);
  const paid = await db.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to).eq('payment_status', 'paid');
  if (!all.error && !paid.error && (all.count ?? 0) > 0) return { started: all.count ?? 0, paid: paid.count ?? 0, source: 'orders.payment_status' };
  const ic = await db.from('tracking_events').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to).eq('event_name', 'InitiateCheckout');
  const pu = await db.from('tracking_events').select('id', { count: 'exact', head: true }).gte('created_at', from).lt('created_at', to).eq('event_name', 'Purchase');
  if (!ic.error && !pu.error && (ic.count ?? 0) > 0) return { started: ic.count ?? 0, paid: pu.count ?? 0, source: 'tracking_events' };
  return null;
}

async function brandUnread(db: SupabaseClient): Promise<{ unread: number; oldest: string | null } | null> {
  const { data, error } = await db.from('whatsapp_conversations').select('unread_count, last_message_at').gt('unread_count', 0).order('last_message_at').limit(200);
  if (error) return null; // brand has no inbox table
  const rows = (data ?? []) as { unread_count: number; last_message_at: string | null }[];
  return { unread: rows.reduce((s, r) => s + (Number(r.unread_count) || 0), 0), oldest: rows[0]?.last_message_at ?? null };
}

async function paidNotShipped(db: SupabaseClient): Promise<number | null> {
  const cutoff = new Date(Date.now() - 24 * HOUR).toISOString();
  const since = new Date(Date.now() - 30 * 24 * HOUR).toISOString();
  const { count, error } = await db.from('orders').select('id', { count: 'exact', head: true })
    .eq('payment_status', 'paid').neq('status', 'cancelled').is('shiprocket_awb_code', null)
    .gte('created_at', since).lt('created_at', cutoff);
  return error ? null : count ?? 0;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export async function loadBrandRow(b: LiveBrand, cur: Period, prev: Period): Promise<BrandRow> {
  const db = brandClient(b);
  const [m, pm, checkout, inbox, pns] = await Promise.all([
    withTimeout(brandMetrics(b, cur), 20_000), withTimeout(brandMetrics(b, prev), 20_000),
    withTimeout(safe(() => checkoutRate(db, cur)), 8_000), withTimeout(safe(() => brandUnread(db)), 8_000), withTimeout(safe(() => paidNotShipped(db)), 8_000),
  ]);
  return {
    key: b.key, name: b.name,
    orders: m?.orders ?? null, prevOrders: pm?.orders ?? null,
    netSales: m?.netSales ?? null, prevNetSales: pm?.netSales ?? null,
    adSpend: m?.adSpend ?? null, costPerOrder: m && m.orders ? Math.round(m.adSpend / m.orders) : null,
    checkout, unread: inbox?.unread ?? null, oldestUnreadAt: inbox?.oldest ?? null, paidNotShipped: pns,
    error: m ? null : 'orders could not be read',
  };
}

export async function loadDevShopRow(sb: SupabaseClient, princeId: string, today: string): Promise<DevShopRow> {
  const in3 = new Date(Date.parse(`${today}T00:00:00Z`) + 3 * 86400_000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * HOUR).toISOString();
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { const r = await q; return r.error ? null : r.count ?? 0; };
  const [wa, leads, posts, due, overdue] = await Promise.all([
    safe(async () => { const r = await sb.from('whatsapp_messages').select('at').eq('direction', 'in').is('read_at', null).order('at').limit(500); return r.error ? null : (r.data ?? []) as { at: string }[]; }),
    safe(() => count(sb.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo))),
    safe(() => count(sb.from('social_publish_queue').select('id', { count: 'exact', head: true }).eq('status', 'ready'))),
    safe(() => count(sb.from('retail_os_ops_tasks').select('id', { count: 'exact', head: true }).eq('member_id', princeId).not('status', 'in', '(done,na)').gte('due_on', today).lte('due_on', in3))),
    safe(() => count(sb.from('retail_os_ops_tasks').select('id', { count: 'exact', head: true }).eq('member_id', princeId).not('status', 'in', '(done,na)').lt('due_on', today))),
  ]);
  return { unread: wa ? wa.length : null, oldestUnreadAt: wa?.[0]?.at ?? null, newLeads7d: leads, postsReady: posts, princeDueSoon: due, princeOverdue: overdue };
}

// ── Needs you (pure) ──────────────────────────────────────────────────────

export type NeedItem = { brand: string; text: string; href: string; kind: 'customer' | 'handles' | 'people' };

/** Only AGENT-ORG "comes to me" items: customer issues, posts on his handles, people (Prince). */
export function buildNeedsYou(
  brands: (BrandRow & { adminUrl: string | null })[],
  dev: DevShopRow,
  now: number = Date.now(),
): NeedItem[] {
  const out: NeedItem[] = [];
  const old = (iso: string | null) => !!iso && now - Date.parse(iso) > 4 * HOUR;
  for (const b of brands) {
    if (b.unread && old(b.oldestUnreadAt)) out.push({ brand: b.name, kind: 'customer', text: `${b.unread} unread customer WhatsApp${b.unread === 1 ? '' : 's'}, oldest over 4 hours`, href: b.adminUrl ? `${b.adminUrl}/inbox` : '#' });
    if (b.paidNotShipped) out.push({ brand: b.name, kind: 'customer', text: `${b.paidNotShipped} paid order${b.paidNotShipped === 1 ? '' : 's'} not shipped after 24 hours`, href: b.adminUrl ? `${b.adminUrl}/orders` : '#' });
  }
  if (dev.unread && old(dev.oldestUnreadAt)) out.push({ brand: 'DevShop', kind: 'customer', text: `${dev.unread} unread WhatsApp${dev.unread === 1 ? '' : 's'}, oldest over 4 hours`, href: '/retail-os/admin/inbox' });
  if (dev.postsReady) out.push({ brand: 'DevShop', kind: 'handles', text: `${dev.postsReady} post${dev.postsReady === 1 ? '' : 's'} waiting for your approval`, href: '/retail-os/admin/publish' });
  if (dev.princeOverdue) out.push({ brand: 'DevShop', kind: 'people', text: `${dev.princeOverdue} of Prince's task${dev.princeOverdue === 1 ? ' is' : 's are'} overdue`, href: '/retail-os/admin/console?tab=team' });
  return out;
}
