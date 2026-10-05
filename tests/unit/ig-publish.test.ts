import { describe, it, expect } from 'vitest';
import { publishImage, publishReel } from '../../src/lib/ig-publish';

const fake = (log: string[]) => (async (u: any, init?: any) => {
  const url = String(u); log.push(`${init?.method ?? 'GET'} ${url.split('?')[0].replace(/.*v23\.0/, '')} ${init?.body ? String(init.body) : ''}`);
  const body = url.includes('/media_publish') ? { id: 'M1' } : url.includes('/media') ? { id: 'C1' } : url.includes('/C1') ? { status_code: 'FINISHED' } : { permalink: 'https://instagram.com/p/x' };
  return new Response(JSON.stringify(body), { status: 200 });
}) as typeof fetch;

describe('publishImage', () => {
  it('feed: container with caption, wait, publish, permalink', async () => {
    const log: string[] = [];
    const r = await publishImage({ handle: 'viratmohan_devshop', kind: 'feed', imageUrl: 'https://x/i.jpg', caption: 'hi' }, 'T', fake(log), async () => {});
    expect(r).toEqual({ mediaId: 'M1', permalink: 'https://instagram.com/p/x' });
    expect(log[0]).toMatch(/POST \/17841437222646246\/media .*caption=hi/);
    expect(log.some((l) => l.includes('/media_publish'))).toBe(true);
  });
  it('story uses media_type STORIES and no caption', async () => {
    const log: string[] = [];
    await publishImage({ handle: 'viratemn', kind: 'story', imageUrl: 'https://x/s.jpg' }, 'T', fake(log), async () => {});
    expect(log[0]).toMatch(/media_type=STORIES/); expect(log[0]).not.toMatch(/caption/);
  });
  it('refuses without a token', async () => {
    await expect(publishImage({ handle: 'viratemn', kind: 'story', imageUrl: 'x' }, '')).rejects.toThrow(/not set/);
  });
});

describe('publishReel', () => {
  it('REELS container with cover, collaborators, caption; polls then publishes', async () => {
    const log: string[] = []; let n = 0;
    const f = (async (u: any, init?: any) => {
      const url = String(u); log.push(`${init?.method ?? 'GET'} ${url.split('?')[0].replace(/.*v23\.0/, '')} ${init?.body ? decodeURIComponent(String(init.body)) : ''}`);
      const body = url.includes('/media_publish') ? { id: 'M1' } : url.includes('/media') ? { id: 'C1' } : url.includes('/C1') ? { status_code: ++n < 3 ? 'IN_PROGRESS' : 'FINISHED' } : { permalink: 'https://instagram.com/reel/x' };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const r = await publishReel({ handle: 'viratmohan_devshop', videoUrl: 'https://x/v.mp4', coverUrl: 'https://x/c.jpg', caption: 'hi', collaborators: ['viratemn'] }, 'T', f, async () => {});
    expect(r).toEqual({ mediaId: 'M1', permalink: 'https://instagram.com/reel/x' });
    expect(log[0]).toMatch(/POST \/17841437222646246\/media /);
    expect(log[0]).toMatch(/media_type=REELS/); expect(log[0]).toMatch(/video_url=https:\/\/x\/v.mp4/);
    expect(log[0]).toMatch(/cover_url=https:\/\/x\/c.jpg/); expect(log[0]).toMatch(/share_to_feed=true/);
    expect(log[0]).toMatch(/collaborators=\["viratemn"\]/);
    expect(n).toBe(3);
  });
  it('throws on ERROR status', async () => {
    const f = (async (u: any) => new Response(JSON.stringify(String(u).includes('/C1') ? { status_code: 'ERROR', status: 'bad codec' } : { id: 'C1' }), { status: 200 })) as typeof fetch;
    await expect(publishReel({ handle: 'viratemn', videoUrl: 'x' }, 'T', f, async () => {})).rejects.toThrow(/bad codec/);
  });
});
