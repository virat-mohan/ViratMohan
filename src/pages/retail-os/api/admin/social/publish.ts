export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../../lib/env';
import { serviceDb } from '../../../../../lib/ledger';
import { json } from '../../../../../lib/retail-os-http';
import { publishImage, publishReel, type Handle } from '../../../../../lib/ig-publish';

// Gated by src/middleware.ts (admin Basic Auth). POST { id } publishes one queued post
// after Virat taps Publish; POST { id, cancel: true } cancels it.
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv(); const sb = serviceDb(env);
  const { id, cancel } = await request.json().catch(() => ({}));
  const { data: row } = await sb.from('social_publish_queue').select('*').eq('id', id).maybeSingle();
  if (!row) return json({ error: 'Not found.' }, 404);
  if (row.status !== 'ready') return json({ error: `Already ${row.status}.` }, 409);
  if (cancel) { await sb.from('social_publish_queue').update({ status: 'cancelled' }).eq('id', id); return json({ ok: true }, 200); }
  if (row.after_id) {
    const { data: prev } = await sb.from('social_publish_queue').select('status').eq('id', row.after_id).maybeSingle();
    if (prev?.status !== 'published') return json({ error: 'Publish the post this follows first.' }, 409);
  }
  try {
    const r = row.kind === 'reel'
      ? await publishReel({ handle: row.handle as Handle, videoUrl: row.image_url, coverUrl: row.cover_url ?? undefined, caption: row.caption, collaborators: row.collaborators ?? [] }, env.META_VIRAT_SOCIAL_TOKEN)
      : await publishImage({ handle: row.handle as Handle, kind: row.kind, imageUrl: row.image_url, caption: row.caption }, env.META_VIRAT_SOCIAL_TOKEN);
    await sb.from('social_publish_queue').update({ status: 'published', media_id: r.mediaId, permalink: r.permalink, published_at: new Date().toISOString(), error: null }).eq('id', id);
    return json({ ok: true, permalink: r.permalink }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb.from('social_publish_queue').update({ error: msg }).eq('id', id);
    return json({ error: msg }, 502);
  }
};
