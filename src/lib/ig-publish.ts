// Publish one image to Virat's own Instagram (feed post or story) through the Graph
// content-publishing API, using the "Virat Mohan Social" system user token. Called
// only from the admin publish page, after Virat taps Publish. Never ads or boosts.
import { GRAPH } from './virat-social';

export const IG_IDS = { viratemn: '17841401892164011', viratmohan_devshop: '17841437222646246' } as const;
export type Handle = keyof typeof IG_IDS;

async function call(path: string, params: Record<string, string>, token: string, method: 'GET' | 'POST', f: typeof fetch) {
  const u = new URL(GRAPH + path);
  const body = new URLSearchParams({ ...params, access_token: token });
  const r = method === 'GET' ? await f(`${u}?${body}`) : await f(u, { method, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.error_user_msg || j.error?.message || `Graph ${r.status}`);
  return j;
}

export async function publishImage(
  o: { handle: Handle; kind: 'feed' | 'story'; imageUrl: string; caption?: string },
  token: string, f: typeof fetch = fetch, wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ mediaId: string; permalink: string | null }> {
  if (!token) throw new Error('META_VIRAT_SOCIAL_TOKEN is not set in Vercel.');
  const ig = IG_IDS[o.handle];
  const params: Record<string, string> = { image_url: o.imageUrl };
  if (o.kind === 'story') params.media_type = 'STORIES'; else params.caption = o.caption ?? '';
  const { id: creation } = await call(`/${ig}/media`, params, token, 'POST', f);
  for (let i = 0; i < 10; i++) {
    const s = await call(`/${creation}`, { fields: 'status_code' }, token, 'GET', f);
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('Instagram could not process the image.');
    await wait(1500);
  }
  const { id } = await call(`/${ig}/media_publish`, { creation_id: creation }, token, 'POST', f);
  const m = await call(`/${id}`, { fields: 'permalink' }, token, 'GET', f).catch(() => ({}));
  return { mediaId: id, permalink: m.permalink ?? null };
}

// Reel: video container (REELS) with cover, optional Instagram collaborators, then publish.
// Video processing is slow, so poll up to ~3 minutes.
export async function publishReel(
  o: { handle: Handle; videoUrl: string; coverUrl?: string; caption?: string; collaborators?: string[] },
  token: string, f: typeof fetch = fetch, wait = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ mediaId: string; permalink: string | null }> {
  if (!token) throw new Error('META_VIRAT_SOCIAL_TOKEN is not set in Vercel.');
  const ig = IG_IDS[o.handle];
  const params: Record<string, string> = { media_type: 'REELS', video_url: o.videoUrl, share_to_feed: 'true', caption: o.caption ?? '' };
  if (o.coverUrl) params.cover_url = o.coverUrl;
  if (o.collaborators?.length) params.collaborators = JSON.stringify(o.collaborators);
  const { id: creation } = await call(`/${ig}/media`, params, token, 'POST', f);
  let ok = false;
  for (let i = 0; i < 60; i++) {
    const s = await call(`/${creation}`, { fields: 'status_code,status' }, token, 'GET', f);
    if (s.status_code === 'FINISHED') { ok = true; break; }
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram could not process the reel (${s.status ?? s.status_code}).`);
    await wait(3000);
  }
  if (!ok) throw new Error('Instagram is still processing the reel. Tap Publish again in a minute.');
  const { id } = await call(`/${ig}/media_publish`, { creation_id: creation }, token, 'POST', f);
  const m = await call(`/${id}`, { fields: 'permalink' }, token, 'GET', f).catch(() => ({}));
  return { mediaId: id, permalink: m.permalink ?? null };
}
