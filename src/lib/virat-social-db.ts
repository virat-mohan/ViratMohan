// Supabase reads for the Social panel and the weekly brief. Pure logic lives in virat-social.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBrief, buildReelViews, followerMix, mondayOf, type BriefIdea, type PostRow, type SnapRow } from './virat-social';

export { syncViratSocial } from './virat-social';

const istDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export async function loadSocial(db: SupabaseClient) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: posts, error } = await db.from('social_posts').select('media_id, handle, product_type, caption, permalink, thumbnail_url, posted_at').gte('posted_at', since).order('posted_at', { ascending: false });
  if (error) throw error;
  const ids = (posts ?? []).map((p) => p.media_id);
  const { data: snaps } = ids.length ? await db.from('social_post_snapshots').select('*').in('media_id', ids) : { data: [] };
  const { data: mix } = await db.from('social_follower_mix').select('ig_id, day, breakdown, bucket, followers').gte('day', new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  const reels = buildReelViews((posts ?? []) as PostRow[], (snaps ?? []) as SnapRow[]);
  const lastSync = (snaps ?? []).reduce((m: string, s: any) => (s.captured_at > m ? s.captured_at : m), '');
  const mixByHandle: Record<string, ReturnType<typeof followerMix>> = {};
  for (const [handle, igId] of [['@viratemn', '17841401892164011'], ['@vmviews', '17841437222646246']]) mixByHandle[handle] = followerMix((mix ?? []).filter((m) => m.ig_id === igId));
  return { reels, posts: posts ?? [], lastSync, mixByHandle };
}

/** Names that must never appear in public copy: every brand in the registry. */
async function brandNames(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from('brands').select('name');
  return (data ?? []).map((b: { name: string }) => b.name).filter(Boolean);
}

/** This week's brief; written once per week (Monday IST) from the last 30 days of reels. */
export async function ensureWeeklyBrief(db: SupabaseClient, force = false): Promise<{ weekStart: string; ideas: BriefIdea[] }> {
  const weekStart = mondayOf(istDay());
  if (!force) {
    const { data } = await db.from('social_briefs').select('ideas').eq('week_start', weekStart).maybeSingle();
    if (data) return { weekStart, ideas: data.ideas as BriefIdea[] };
  }
  const { reels } = await loadSocial(db);
  const ideas = buildBrief(reels, weekStart, await brandNames(db));
  const { error } = await db.from('social_briefs').upsert({ week_start: weekStart, ideas, created_at: new Date().toISOString() }, { onConflict: 'week_start' });
  if (error) throw error;
  return { weekStart, ideas };
}
