// Founder line: Virat's personal number (919999277240) messaging the DevShop WhatsApp
// Business number. Read-only commands are answered from live data; anything else is
// queued in founder_requests for Dev to confirm in Claude. Nothing is ever executed
// from a WhatsApp message: no sending, posting, money or client contact.
// Echoes (messages Virat sends to customers from the Business app, coexistence) arrive as
// message_echoes, are stored as outbound by whatsapp-inbox.ts and never reach this file.
// Every reply is a short summary: headline first, top 3 at most, then a link.

export const FOUNDER_PHONE = '919999277240';
export const FOUNDER_RATE_PER_HOUR = 30;
export const PLANNER_URL = 'https://www.viratmohan.com/retail-os/admin/org?tab=planner';
export const BRIEF_TEMPLATE = 'founder_daily_brief'; // utility template: {{1}} date, {{2}} summary
const WINDOW_MS = 24 * 3600_000;

export type FounderCommand = 'status' | 'inbox' | 'agents' | 'priorities' | 'help';

export function parseFounderCommand(text: string): FounderCommand | null {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  if (t === 'status' || t === 'today') return 'status';
  if (t === 'inbox' || t === 'agents' || t === 'priorities' || t === 'help') return t;
  return null;
}

export const HELP_TEXT = [
  'Founder line commands:',
  'status (or today): orders, revenue, unread',
  'inbox: unread customer WhatsApps',
  'agents: who is on track or blocked',
  'priorities: Dev\'s latest priorities',
  'Anything else is queued as a request for Dev.',
].join('\n');

export const shortId = (id: string) => id.replace(/-/g, '').slice(0, 6);
export const queuedText = (id: string) => `Got it. Queued for Dev as request #${shortId(id)}. Confirm in Claude to start it.`;

// ── Pure formatting ──────────────────────────────────────────────────────

export type BrandDay = { name: string; orders: number | null; revenue: number | null; prevOrders: number | null; prevRevenue: number | null; unread: number | null; oldestUnreadAt?: string | null };
export type MemberStatus = { id: string; name: string; status: string | null; summary: string };
export type FounderSnapshot = {
  date: string; brands: BrandDay[]; devshopUnread: number | null; devshopOldestUnreadAt?: string | null;
  needs: { brand: string; text: string }[]; blocked: MemberStatus[]; queuedRequests: number | null;
};

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const day = (o: number | null, r: number | null) => (o == null || r == null ? 'no data' : `${o} / ${inr(r)}`);
const top3 = <T>(list: T[], f: (x: T) => string) => list.slice(0, 3).map(f).join(', ') + (list.length > 3 ? ` +${list.length - 3} more` : '');

export function totals(s: FounderSnapshot) {
  const known = s.brands.filter((b) => b.orders != null && b.revenue != null);
  return {
    orders: known.reduce((a, b) => a + (b.orders ?? 0), 0), revenue: known.reduce((a, b) => a + (b.revenue ?? 0), 0),
    complete: known.length === s.brands.length,
    unread: (s.devshopUnread ?? 0) + s.brands.reduce((a, b) => a + (b.unread ?? 0), 0),
  };
}

/** The 8pm brief (and "status"): at most 8 lines, headline first. */
export function briefLines(s: FounderSnapshot, opts: { withNeeds?: boolean } = { withNeeds: true }): string[] {
  const t = totals(s);
  const lines = [`${s.date}: ${t.orders} orders, ${inr(t.revenue)} today${t.complete ? '' : ' (some brands no data)'}`];
  if (s.brands.length) lines.push(top3(s.brands, (b) => `${b.name} ${day(b.orders, b.revenue)} (yday ${day(b.prevOrders, b.prevRevenue)})`));
  lines.push(`Unread customer WhatsApps: ${t.unread}`);
  if (opts.withNeeds && s.needs.length) lines.push(`Needs you: ${top3(s.needs, (n) => `${n.brand} ${n.text}`)}`);
  if (s.blocked.length) lines.push(`Blocked: ${top3(s.blocked, (m) => m.name)}`);
  if (s.queuedRequests) lines.push(`Queued requests: ${s.queuedRequests}`);
  lines.push(PLANNER_URL);
  return lines.slice(0, 8);
}

export function inboxLines(s: FounderSnapshot): string[] {
  const rows = [
    ...(s.devshopUnread ? [{ name: 'DevShop', unread: s.devshopUnread, oldest: s.devshopOldestUnreadAt ?? null }] : []),
    ...s.brands.filter((b) => b.unread).map((b) => ({ name: b.name, unread: b.unread!, oldest: b.oldestUnreadAt ?? null })),
  ].sort((a, b) => (a.oldest ? Date.parse(a.oldest) : Infinity) - (b.oldest ? Date.parse(b.oldest) : Infinity));
  const total = rows.reduce((a, r) => a + r.unread, 0);
  if (!total) return ['Inbox: nothing unread.', 'https://www.viratmohan.com/retail-os/admin/inbox'];
  const age = (iso: string | null) => (iso ? `${Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 3600_000))}h` : '?');
  return [`Inbox: ${total} unread`, ...rows.slice(0, 3).map((r) => `${r.name} ${r.unread}, oldest ${age(r.oldest)}`), 'https://www.viratmohan.com/retail-os/admin/inbox'];
}

export function agentLines(members: MemberStatus[]): string[] {
  const label = (s: string | null) => s ?? 'not reported';
  const count = (k: string | null) => members.filter((m) => m.status === k).length;
  const attention = members.filter((m) => m.status === 'blocked' || m.status === 'needs_help');
  return [
    `Agents: ${count('on_track')} on track, ${attention.length} blocked or need help, ${count(null)} not reported`,
    ...attention.slice(0, 3).map((m) => `${m.name} (${label(m.status).replace('_', ' ')}): ${m.summary.slice(0, 80)}`),
    'https://www.viratmohan.com/retail-os/admin/org',
  ];
}

export function priorityLines(u: { at: string; summary: string; pending: string[]; next_step: string | null } | null): string[] {
  if (!u) return ['Dev has not posted priorities yet.', 'https://www.viratmohan.com/retail-os/admin/org'];
  const when = new Date(u.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return [
    `Dev, ${when}: ${u.summary.slice(0, 160)}`,
    ...u.pending.slice(0, 3).map((p) => `- ${p.slice(0, 80)}`),
    ...(u.next_step ? [`Next: ${u.next_step.slice(0, 100)}`] : []),
    'https://www.viratmohan.com/retail-os/admin/org',
  ].slice(0, 8);
}

// ── Send rule: free text inside 24h of Virat's last message, else the template ──

export type FounderSendDeps = {
  now: Date;
  lastInboundAt: () => Promise<string | null>; // Virat's last message to the DevShop number
  templateApproved: boolean;
  send: (to: string, text: string, template?: { name: string; lang: string; params: string[] }) => Promise<void>;
  log: (row: { body: string; status: string }) => Promise<void>;
};

/** Template params may not carry newlines or long runs of spaces. */
export const flatParam = (s: string) => s.replace(/\s*\n+\s*/g, ' · ').replace(/\s{2,}/g, ' ').slice(0, 1000);

export async function sendToFounder(text: string, dateLabel: string, deps: FounderSendDeps): Promise<'text' | 'template' | 'skipped'> {
  const last = await deps.lastInboundAt();
  const inWindow = !!last && deps.now.getTime() - Date.parse(last) < WINDOW_MS;
  if (inWindow) {
    await deps.send(FOUNDER_PHONE, text);
    await deps.log({ body: text, status: 'sent' });
    return 'text';
  }
  if (!deps.templateApproved) {
    await deps.log({ body: text, status: 'skipped_no_template' });
    return 'skipped';
  }
  await deps.send(FOUNDER_PHONE, text, { name: BRIEF_TEMPLATE, lang: 'en', params: [dateLabel, flatParam(text)] });
  await deps.log({ body: text, status: 'sent' });
  return 'template';
}
