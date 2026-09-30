// Virat's personal Instagram (@viratemn, @vmviews): read-only sync, 48h trial verdicts,
// follower mix and the weekly D2C content brief.
//
// Rules this file enforces (memory: virat-social-d2c-focus, no-brand-names-percent-only):
// - Read only. Every Graph call is a GET to media/insights paths. No ads, no boosting;
//   ads_management is never used, and the sync refuses any path that is not on the allowlist.
// - Content speaks to D2C founders only. No food angle, no client brand names, percentages
//   only (no rupees, orders or spend), and every reel ends "DM me D2C".
import type { SupabaseClient } from '@supabase/supabase-js';

export const GRAPH = 'https://graph.facebook.com/v23.0';
export const ACCOUNTS = [
  { handle: '@viratemn', igId: '17841401892164011' },
  { handle: '@vmviews', igId: '17841437222646246' },
] as const;
export const CTA = 'DM me D2C';
const DAY = 86400000;

const REEL_METRICS = 'reach,views,likes,comments,shares,saved,ig_reels_avg_watch_time,ig_reels_video_view_total_time';
const POST_METRICS = 'reach,views,likes,comments,shares,saved';

/** The only Graph paths this module may call. Anything else (ads, promote, boost) is refused. */
const ALLOWED = [/^\/\d+\/media$/, /^\/\d+\/insights$/, /^\/me\/permissions$/];

export async function graphGet(path: string, params: Record<string, string>, token: string, fetchImpl: typeof fetch = fetch): Promise<any> {
  if (!ALLOWED.some((r) => r.test(path))) throw new Error(`Graph path not allowed (read-only sync): ${path}`);
  const u = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', token);
  const r = await fetchImpl(u, { method: 'GET' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message ?? `Graph ${r.status}`);
  return j;
}

export type Media = { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; thumbnail_url?: string; media_url?: string; timestamp: string };
export type Snapshot = { reach: number | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; saved: number | null; avg_watch_ms: number | null; total_watch_ms: number | null };

const METRIC_COL: Record<string, keyof Snapshot> = {
  reach: 'reach', views: 'views', likes: 'likes', comments: 'comments', shares: 'shares', saved: 'saved',
  ig_reels_avg_watch_time: 'avg_watch_ms', ig_reels_video_view_total_time: 'total_watch_ms',
};

export function parseInsights(j: any): Snapshot {
  const s: Snapshot = { reach: null, views: null, likes: null, comments: null, shares: null, saved: null, avg_watch_ms: null, total_watch_ms: null };
  for (const m of j?.data ?? []) {
    const col = METRIC_COL[m.name];
    const v = m.values?.[0]?.value ?? m.total_value?.value;
    if (col && typeof v === 'number') s[col] = Math.round(v);
  }
  return s;
}

/** follower_demographics → [{bucket, followers}] for one breakdown. */
export function parseDemographics(j: any): { bucket: string; followers: number }[] {
  const results = j?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return results.map((r: any) => ({ bucket: String(r.dimension_values?.join(' · ') ?? '?'), followers: Number(r.value) || 0 }));
}

const istDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export type SyncResult = { handle: string; posts: number; snapshots: number; followerMix: string; error?: string };

/** Pull the last 35 days of media plus insights for both accounts into Supabase. */
export async function syncViratSocial(db: SupabaseClient, token: string, fetchImpl: typeof fetch = fetch): Promise<{ results: SyncResult[]; adsPermission: boolean }> {
  const day = istDay();
  const since = Date.now() - 35 * DAY;
  let adsPermission = false;
  try {
    const p = await graphGet('/me/permissions', {}, token, fetchImpl);
    adsPermission = (p.data ?? []).some((x: any) => x.permission === 'ads_management' && x.status === 'granted');
  } catch { /* system-user tokens may not expose this; the sync stays read-only either way */ }

  const results: SyncResult[] = [];
  for (const acct of ACCOUNTS) {
    const res: SyncResult = { handle: acct.handle, posts: 0, snapshots: 0, followerMix: 'skipped' };
    try {
      const media: Media[] = [];
      let after: string | undefined;
      for (let page = 0; page < 5; page++) {
        const j = await graphGet(`/${acct.igId}/media`, { fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp', limit: '50', ...(after ? { after } : {}) }, token, fetchImpl);
        const batch: Media[] = j.data ?? [];
        media.push(...batch.filter((m) => Date.parse(m.timestamp) >= since));
        after = j.paging?.cursors?.after;
        if (!j.paging?.next || batch.some((m) => Date.parse(m.timestamp) < since)) break;
      }
      for (const m of media) {
        const reel = m.media_product_type === 'REELS';
        const { error: pe } = await db.from('social_posts').upsert({
          media_id: m.id, ig_id: acct.igId, handle: acct.handle, media_type: m.media_type ?? null, product_type: m.media_product_type ?? null,
          caption: m.caption ?? null, permalink: m.permalink ?? null, thumbnail_url: m.thumbnail_url ?? (m.media_type === 'IMAGE' ? m.media_url ?? null : null),
          posted_at: m.timestamp, updated_at: new Date().toISOString(),
        }, { onConflict: 'media_id' });
        if (pe) throw pe;
        res.posts++;
        let snap: Snapshot;
        try { snap = parseInsights(await graphGet(`/${m.id}/insights`, { metric: reel ? REEL_METRICS : POST_METRICS }, token, fetchImpl)); }
        catch { continue; } // e.g. stories past 24h, or a post too new for insights
        const { error: se } = await db.from('social_post_snapshots').upsert({ media_id: m.id, day, captured_at: new Date().toISOString(), ...snap }, { onConflict: 'media_id,day' });
        if (se) throw se;
        res.snapshots++;
      }
      const mix: string[] = [];
      for (const breakdown of ['city', 'age', 'gender']) {
        try {
          const rows = parseDemographics(await graphGet(`/${acct.igId}/insights`, { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown }, token, fetchImpl));
          if (rows.length) {
            const { error } = await db.from('social_follower_mix').upsert(rows.map((r) => ({ ig_id: acct.igId, day, breakdown, bucket: r.bucket, followers: r.followers })), { onConflict: 'ig_id,day,breakdown,bucket' });
            if (error) throw error;
            mix.push(breakdown);
          }
        } catch { /* Meta only returns demographics above 100 followers */ }
      }
      res.followerMix = mix.length ? mix.join(', ') : 'not available (Meta needs 100+ followers)';
    } catch (e) {
      res.error = e instanceof Error ? e.message : String(e);
    }
    results.push(res);
  }
  return { results, adsPermission };
}

// ── Reading for the panel ────────────────────────────────────────────────────────────

export type PostRow = { media_id: string; handle: string; product_type: string | null; caption: string | null; permalink: string | null; thumbnail_url: string | null; posted_at: string };
export type SnapRow = Snapshot & { media_id: string; day: string; captured_at: string };
export type Verdict = 'winner' | 'loser' | 'hold' | 'too early';
export type ReelView = PostRow & { latest: SnapRow | null; at48: SnapRow | null; verdict: Verdict; verdictWhy: string };

export const shareRate = (s: Snapshot | null) => (s?.reach ? (s.shares ?? 0) / s.reach : 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** First snapshot taken at least 48h after posting: that is the reel's trial window. */
export function snapshotAt48h(post: PostRow, snaps: SnapRow[]): SnapRow | null {
  const cutoff = Date.parse(post.posted_at) + 2 * DAY;
  return snaps.filter((s) => Date.parse(s.captured_at) >= cutoff).sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))[0] ?? null;
}

/**
 * 48h trial verdict against the median of this account's other reels at 48h.
 * Winner: holds attention (avg watch) at or above median AND reaches or gets shared at or above median.
 * Loser: below median on watch time AND on both reach and share rate. Anything else: hold.
 */
export function verdictFor(r: { at48: SnapRow | null; posted_at: string }, peers: SnapRow[], now = Date.now()): { verdict: Verdict; why: string } {
  if (!r.at48) return { verdict: 'too early', why: now - Date.parse(r.posted_at) < 2 * DAY ? 'Under 48 hours old' : 'No snapshot yet after 48 hours' };
  if (peers.length < 2) return { verdict: 'hold', why: 'Needs at least 2 other reels to compare with' };
  const mWatch = median(peers.map((p) => p.avg_watch_ms ?? 0)), mReach = median(peers.map((p) => p.reach ?? 0)), mShare = median(peers.map(shareRate));
  const pctVs = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : 'n/a');
  const w = r.at48.avg_watch_ms ?? 0, re = r.at48.reach ?? 0, sh = shareRate(r.at48);
  const why = `Watch ${pctVs(w, mWatch)}, reach ${pctVs(re, mReach)}, share rate ${pctVs(sh, mShare)} vs the median reel`;
  if (w >= mWatch && (re >= mReach || sh >= mShare)) return { verdict: 'winner', why };
  if (w < mWatch && re < mReach && sh < mShare) return { verdict: 'loser', why };
  return { verdict: 'hold', why };
}

export function buildReelViews(posts: PostRow[], snaps: SnapRow[], now = Date.now()): ReelView[] {
  const byMedia = new Map<string, SnapRow[]>();
  for (const s of snaps) (byMedia.get(s.media_id) ?? byMedia.set(s.media_id, []).get(s.media_id)!).push(s);
  const reels = posts.filter((p) => p.product_type === 'REELS').map((p) => {
    const list = byMedia.get(p.media_id) ?? [];
    const latest = [...list].sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at))[0] ?? null;
    return { ...p, latest, at48: snapshotAt48h(p, list) };
  });
  return reels.map((r) => {
    const peers = reels.filter((o) => o.media_id !== r.media_id && o.handle === r.handle && o.at48).map((o) => o.at48!);
    const v = verdictFor(r, peers, now);
    return { ...r, verdict: v.verdict, verdictWhy: v.why };
  });
}

export type RankKey = 'watch' | 'shares' | 'reach';
export function rankReels(reels: ReelView[], key: RankKey): ReelView[] {
  const val = (r: ReelView) => (key === 'watch' ? r.latest?.avg_watch_ms : key === 'shares' ? r.latest?.shares : r.latest?.reach) ?? -1;
  return [...reels].sort((a, b) => val(b) - val(a));
}

/** Follower mix as percentages of the latest day per breakdown (top 6). */
export function followerMix(rows: { breakdown: string; bucket: string; followers: number; day: string }[]) {
  const out: Record<string, { bucket: string; pct: number }[]> = {};
  for (const b of ['gender', 'age', 'city']) {
    const rs = rows.filter((r) => r.breakdown === b);
    const latest = rs.reduce((d, r) => (r.day > d ? r.day : d), '');
    const today = rs.filter((r) => r.day === latest);
    const total = today.reduce((t, r) => t + r.followers, 0);
    if (total) out[b] = today.sort((a, c) => c.followers - a.followers).slice(0, 6).map((r) => ({ bucket: r.bucket, pct: Math.round((r.followers / total) * 100) }));
  }
  return out;
}

// ── Weekly content brief ─────────────────────────────────────────────────────────────

export type Pillar = 'ads' | 'retention' | 'store' | 'ops' | 'founder';
export const PILLARS: Record<Pillar, { label: string; words: RegExp }> = {
  ads: { label: 'Ads that pay back', words: /\broas\b|\bads?\b|meta|creative|cac|campaign/i },
  retention: { label: 'Repeat customers', words: /retention|repeat|whatsapp|email|loyal|ltv|subscri/i },
  store: { label: 'Store and catalog', words: /shopify|catalog|store|product page|checkout|conversion|landing/i },
  ops: { label: 'Run it on a system', words: /system|automat|dashboard|inventory|ops|ai\b|retail os/i },
  founder: { label: 'Founder lessons', words: /founder|mistake|lesson|learn|story|why i/i },
};

const IDEAS: Record<Pillar, { hook: string; beats: string[] }[]> = {
  ads: [
    { hook: 'Your ROAS is lying to you. Here is the one number I check first.', beats: ['Screen: store ROAS next to Meta ROAS, values blurred', 'The gap between the two, in %', 'What I change when the gap is over 30%'] },
    { hook: 'I cut a D2C brand\'s ad sets by half. Return went up.', beats: ['Before/after of the ad set list, names blurred', 'Why fewer ad sets learn faster', 'The % change in ROAS'] },
    { hook: 'Stop testing 10 creatives. Test 3 this way.', beats: ['The 3-hook test', 'How I judge a creative in 48 hours', 'What a winner looks like, in %'] },
  ],
  retention: [
    { hook: 'Most D2C brands chase new customers. The money is in the second order.', beats: ['Repeat rate as a %', 'The one message sent on day 21', 'What moved it, in %'] },
    { hook: 'The WhatsApp message that brings buyers back.', beats: ['Screen: the message, brand blurred', 'Why the timing matters', 'Repeat-order lift in %'] },
  ],
  store: [
    { hook: 'Three things on your product page that quietly kill sales.', beats: ['Walk a product page, brand blurred', 'Fix each one in a line', 'Conversion change in %'] },
    { hook: 'Your Shopify store is not slow. Your apps are.', beats: ['Speed score before/after', 'Which apps to remove', 'Conversion change in %'] },
  ],
  ops: [
    { hook: 'What a D2C founder\'s Monday looks like when the system runs the week.', beats: ['Screen: the Monday results email, values blurred', 'What runs on its own', 'What I still decide by hand'] },
    { hook: 'One dashboard, every number a D2C founder needs.', beats: ['Screen: Retail OS dashboard, values blurred', 'The 4 numbers I read first', 'What changed this month, in %'] },
  ],
  founder: [
    { hook: 'A working online business in 7 days. Here is what day 1 looks like.', beats: ['Day 1 checklist on screen', 'What the founder does vs what I do', 'Why 7 days is enough'] },
    { hook: 'The mistake I see in every D2C brand I audit.', beats: ['The pattern, no names', 'What it costs, in %', 'The fix'] },
  ],
};

export type BriefIdea = { pillar: Pillar; pillarLabel: string; hook: string; beats: string[]; caption: string; why: string };

export function pillarOf(caption: string | null): Pillar | null {
  for (const [k, p] of Object.entries(PILLARS)) if (p.words.test(caption ?? '')) return k as Pillar;
  return null;
}

/** Why each rule exists: see the memory files named at the top of this file. */
export function checkCopy(text: string, brandNames: string[] = []): string[] {
  const problems: string[] = [];
  if (!text.trim().endsWith(CTA)) problems.push(`Must end "${CTA}"`);
  if (/₹|\brs\.?\s*\d|\binr\b|\blakh|\bcrore/i.test(text)) problems.push('Money value: use percentages only');
  const bare = text.replace(/\d+(\.\d+)?\s*%/g, '').replace(/\b(7 days?|day \d+|48 hours|\d+ numbers?|\d+ things|\d+ creatives|\d+ ad sets|\d+ apps?|3-hook|monday)\b/gi, '');
  if (/\d{2,}/.test(bare)) problems.push('A raw number that is not a %: percentages only');
  if (/\b(food|kitchen|cloud kitchen|restaurant|recipe|chef|meal|dish|tiffin)\b/i.test(text)) problems.push('Food angle is parked: D2C founders only');
  for (const b of brandNames) if (b.trim().length > 2 && new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) problems.push(`Names a brand (${b})`);
  return problems;
}

/**
 * Three ideas for the week: two from the pillar whose reels held attention best in the last
 * 30 days, one from a pillar not yet tried (a trial). Rotates by week so ideas do not repeat.
 */
export function buildBrief(reels: ReelView[], weekStart: string, brandNames: string[] = []): BriefIdea[] {
  const stats = new Map<Pillar, { watch: number[]; share: number[] }>();
  for (const r of reels) {
    const p = pillarOf(r.caption);
    if (!p || !r.latest) continue;
    const s = stats.get(p) ?? stats.set(p, { watch: [], share: [] }).get(p)!;
    s.watch.push(r.latest.avg_watch_ms ?? 0); s.share.push(shareRate(r.latest));
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const allWatch = avg(reels.map((r) => r.latest?.avg_watch_ms ?? 0).filter(Boolean));
  const ranked = [...stats.entries()].sort((a, b) => avg(b[1].watch) - avg(a[1].watch));
  const best: Pillar = ranked[0]?.[0] ?? 'ads';
  const untried = (Object.keys(PILLARS) as Pillar[]).filter((p) => !stats.has(p) && p !== best);
  const trial: Pillar = untried[0] ?? ranked[ranked.length - 1]?.[0] ?? 'founder';
  const week = Math.floor(Date.parse(weekStart) / (7 * DAY));
  const pick = (p: Pillar, n: number) => IDEAS[p][(week + n) % IDEAS[p].length];

  const bestWhy = ranked[0] && allWatch
    ? `${PILLARS[best].label} reels held attention ${Math.round(((avg(ranked[0][1].watch) - allWatch) / allWatch) * 100)}% vs the average reel in the last 30 days (${ranked[0][1].watch.length} reels).`
    : 'No tagged reels yet in the last 30 days; ads is the question D2C founders ask first.';
  const trialWhy = stats.has(trial) ? `${PILLARS[trial].label} is the weakest pillar so far; one trial reel to see if a sharper hook fixes it.` : `${PILLARS[trial].label} has not been tried yet; one trial reel to test it.`;

  const slots: [Pillar, number, string][] = [[best, 0, bestWhy], [best === trial ? 'founder' : best, 1, bestWhy], [trial, 2, trialWhy]];
  const seen = new Set<string>();
  return slots.map(([p, n, why]) => {
    let idea = pick(p, n);
    for (let k = n + 1; seen.has(idea.hook) && k < n + 5; k++) idea = pick(p, k);
    seen.add(idea.hook);
    const caption = `${idea.hook}\n\nFor D2C founders who want the numbers to work. Every result shown is a %, brand names blurred.\n\n${CTA}`;
    const problems = checkCopy(caption, brandNames);
    if (problems.length) throw new Error(`Brief broke a rule: ${problems.join('; ')}`);
    return { pillar: p, pillarLabel: PILLARS[p].label, hook: idea.hook, beats: [...idea.beats, `Close on camera: "${CTA}"`], caption, why };
  });
}

export function mondayOf(isoDay: string): string {
  const d = new Date(isoDay + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** The brief as a content & performance calendar spec (tools/calendar/render.mjs). Organic only. */
export function briefCalendarSpec(ideas: BriefIdea[], weekStart: string, thumbs: string[] = []) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const postDays = [0, 2, 4];
  const date = (i: number) => { const d = new Date(weekStart + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return `${days[i]} ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`; };
  const label = date(0).slice(4);
  return {
    slug: `virat-social-${weekStart}`,
    brand: 'Virat Mohan · @viratemn, @vmviews',
    title: `Reel brief, week of ${label}`,
    approver: 'Virat',
    intro: `Three trial reels for D2C founders, Mon, Wed and Fri. Each is judged at 48 hours on watch time, reach and share rate against the median reel. No brand names, percentages only, every reel ends "${CTA}".`,
    weeksPerPage: 1,
    weeks: [{ label, theme: 'D2C founders', days: days.map((_, i) => {
      const k = postDays.indexOf(i);
      return k < 0 ? { date: date(i) } : { date: date(i), post: { type: 'reel', ...(thumbs[k] ? { image: thumbs[k] } : {}), caption: `${ideas[k].hook} ${CTA}`, why: ideas[k].why } };
    }) }],
    boxes: [
      { title: 'How often, and why', big: '3 a week', text: 'Mon, Wed, Fri. Enough reels to learn from each week, with 48 hours between trials so each verdict is clean.' },
      { title: 'The evidence', text: ideas[0].why },
      { title: 'The rules', text: `D2C founders only, no food angle. Never name a client brand. Percentages only, no rupees, orders or spend. Blur names and values in screen recordings. Every reel ends "${CTA}".` },
    ],
    performance: {
      channel: 'Organic only',
      intro: 'No ad spend and no boosting this week. Reels earn reach on their own; winners at 48 hours shape next week\'s brief.',
      weeks: [label],
      campaigns: ideas.map((idea, k) => ({ ...(thumbs[k] ? { image: thumbs[k] } : {}), name: idea.pillarLabel, sub: 'Trial reel · organic', audience: 'D2C founders', creative: idea.hook, weekly: { [label]: '₹0, organic' }, budget: '₹0', expected: 'judged at 48h', why: idea.why })),
      boxes: [
        { title: 'What this buys', text: 'Nothing is bought. Three trial reels that tell me which D2C topic earns attention.' },
        { title: 'Rules the system runs by', text: 'Winner: watch time at or above median and reach or share rate at or above median. Loser: below on all three. Otherwise hold. ads_management is never used.' },
        { title: 'What Virat approves', text: 'Each hook and caption before it is filmed and posted.' },
      ],
      footRight: 'Verdicts compare each reel with the median reel on the same account',
    },
  };
}
