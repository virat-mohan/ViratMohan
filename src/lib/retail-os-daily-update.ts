// Daily Founder Update: one email per live brand, from the day it signs.
// It says what I did in the last 24 hours and why it matters, shows the real
// last-24h numbers (or "pre-launch" when the store isn't live yet), and links
// the brand's live journey page. Recipients live in retail_os_founder_update_subs,
// so a brand is subscribed the moment it signs. The founder-update cron
// (src/pages/api/cron/founder-update.ts) sends these; nothing here invents a
// number — orders/sales come from the brand's own store via brandMetrics.
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { renderRetailOsEmail } from './retail-os-email';
import { getLiveBrands, type LiveBrand } from './retail-os-portfolio';
import { buildBrandReport } from './retail-os-reports';
import type { OpsTask } from './retail-os-ops';

const WHATSAPP = 'https://wa.me/919999277240';
const SITE = 'https://www.viratmohan.com';

export type UpdateEnv = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; LEAD_TOKEN_SECRET?: string };
export type FounderUpdateSub = { brand_key: string; brand_name: string; to_emails: string[]; active: boolean; started_on: string | null; waiting_on: string | null };
export type BuiltUpdate = { to: string; subject: string; html: string; brand_key: string; done: number; hasMetrics: boolean };

function sb(env: UpdateEnv) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const firstName = (email: string) => (email.split('@')[0] || '').replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** Greeting names, from the subscription's recipients. */
function greetNames(sub: FounderUpdateSub): string {
  const names = sub.to_emails.map(firstName).filter(Boolean);
  if (names.length === 0) return 'there';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export async function listActiveSubs(env: UpdateEnv): Promise<FounderUpdateSub[]> {
  const { data, error } = await sb(env).from('retail_os_founder_update_subs').select('*').eq('active', true).order('brand_name');
  if (error) throw new Error(`founder-update listSubs failed: ${error.message}`);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    brand_key: String(r.brand_key),
    brand_name: String(r.brand_name),
    to_emails: String(r.to_emails).split(',').map((s) => s.trim()).filter(Boolean),
    active: Boolean(r.active),
    started_on: (r.started_on as string) ?? null,
    waiting_on: (r.waiting_on as string) ?? null,
  }));
}

async function brandTasks(env: UpdateEnv, brandKey: string, since: string): Promise<{ done: OpsTask[]; next: OpsTask[] }> {
  const { data, error } = await sb(env).from('retail_os_ops_tasks').select('*').eq('brand_key', brandKey);
  if (error) throw new Error(`founder-update tasks failed: ${error.message}`);
  const tasks = (data ?? []) as OpsTask[];
  const done = tasks.filter((t) => t.status === 'done' && t.updated_at >= since).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const next = tasks.filter((t) => t.status === 'todo' || t.status === 'doing').sort((a, b) => a.priority - b.priority || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')).slice(0, 3);
  return { done, next };
}

// --- signed, unguessable journey link (over the brand key) ---------------------------------------
export function journeyToken(brandKey: string, secret: string): string {
  const id = Buffer.from(brandKey).toString('base64url');
  const sig = createHmac('sha256', secret).update(`journey:${brandKey}`).digest('base64url');
  return `${id}.${sig}`;
}
export function readJourneyToken(token: string | undefined | null, secret: string): string | null {
  if (!secret || secret.length < 32 || !token || token.length > 200) return null;
  const [idPart, sigPart, extra] = token.split('.');
  if (!idPart || !sigPart || extra !== undefined) return null;
  let brandKey: string;
  try { brandKey = Buffer.from(idPart, 'base64url').toString('utf8'); } catch { return null; }
  const want = createHmac('sha256', secret).update(`journey:${brandKey}`).digest();
  let got: Buffer;
  try { got = Buffer.from(sigPart, 'base64url'); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return brandKey;
}
export function journeyUrl(brandKey: string, secret: string, origin = SITE): string {
  return `${origin}/retail-os/journey/${journeyToken(brandKey, secret)}`;
}

export type JourneyData = { brand_name: string; done: OpsTask[]; total: number; doneCount: number; pct: number };
/** Read-only data for a brand's live journey page: completed work newest-first, plus progress. */
export async function getJourneyData(env: UpdateEnv, brandKey: string): Promise<JourneyData | null> {
  const s = sb(env);
  const [{ data: subRow }, { data: taskRows }] = await Promise.all([
    s.from('retail_os_founder_update_subs').select('brand_name').eq('brand_key', brandKey).maybeSingle(),
    s.from('retail_os_ops_tasks').select('*').eq('brand_key', brandKey),
  ]);
  if (!subRow) return null;
  const tasks = (taskRows ?? []) as OpsTask[];
  const done = tasks.filter((t) => t.status === 'done').sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const counted = tasks.filter((t) => t.status !== 'na');
  const pct = counted.length ? Math.round((done.length / counted.length) * 100) : 0;
  return { brand_name: String((subRow as Record<string, unknown>).brand_name), done, total: counted.length, doneCount: done.length, pct };
}

/** Compose one brand's daily update. Never invents numbers: metrics only when the store is live and reachable. */
export async function buildFounderUpdate(env: UpdateEnv, sub: FounderUpdateSub, since: string, todayLabel: string): Promise<BuiltUpdate> {
  // Only completed work reaches the founder. Internal to-dos, blocked items and
  // error chores stay out of the client's inbox: the update reads as confident,
  // handled progress, never a list of what went wrong.
  const { done } = await brandTasks(env, sub.brand_key, since);

  let orders: number | null = null;
  let netSales: number | null = null;
  try {
    const brand: LiveBrand | undefined = getLiveBrands().find((b) => b.key === sub.brand_key);
    if (brand) {
      const r = await buildBrandReport(brand, 'daily');
      orders = r.current.orders;
      netSales = r.current.netSales;
    }
  } catch {
    // Store not live yet, or not reachable: fall back to "pre-launch". Never fabricate a number.
  }
  const hasMetrics = orders !== null && netSales !== null;

  const lines: string[] = [
    `Hi ${greetNames(sub)},`,
    done.length
      ? `Here's what I did on ${sub.brand_name} in the last 24 hours, and what's next.`
      : `A quick note on ${sub.brand_name}: here's where we are and what I'm on next.`,
  ];
  if (done.length) {
    lines.push('Done in the last 24 hours:');
    for (const t of done.slice(0, 6)) lines.push(`✓ ${t.task}`);
  } else {
    lines.push('Setup continued behind the scenes today. I’ll have the next milestones in tomorrow’s update.');
  }
  // Gentle reminder of what's on the founder's side, so they always know where the ball is.
  if (sub.waiting_on) lines.push(`When you have a moment: ${sub.waiting_on}.`);
  else lines.push('Nothing needed from you right now — I’ll flag it the moment something does.');
  lines.push('Any comments? Just reply and I’ll fold them into tomorrow’s plan.');

  const rows = hasMetrics
    ? [{ label: 'Orders (last 24h)', value: String(orders) }, { label: 'Net sales (last 24h)', value: inr(netSales as number) }]
    : [{ label: 'Orders (last 24h)', value: '0' }, { label: 'Revenue (last 24h)', value: '₹0 — pre-launch build' }];

  const secret = env.LEAD_TOKEN_SECRET ?? '';
  const secondary = secret.length >= 32 ? { label: 'See your live journey', url: journeyUrl(sub.brand_key, secret) } : undefined;

  const html = renderRetailOsEmail({
    preheader: done.length ? `${done.length} thing${done.length > 1 ? 's' : ''} done on ${sub.brand_name} in the last 24 hours.` : `Where ${sub.brand_name} stands today.`,
    eyebrow: `Daily Founder Update · ${sub.brand_name}`,
    heading: `${sub.brand_name}: ${todayLabel}`,
    lines,
    rows,
    cta: { label: 'Let’s talk', url: WHATSAPP },
    secondary,
  });

  return { to: sub.to_emails.join(', '), subject: `${sub.brand_name} — your daily update (${todayLabel})`, html, brand_key: sub.brand_key, done: done.length, hasMetrics };
}
