import { describe, it, expect } from 'vitest';
import { publishImage } from '../../src/lib/ig-publish';

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
