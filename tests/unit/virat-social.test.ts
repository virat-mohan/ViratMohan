import { describe, it, expect } from 'vitest';
import { graphGet, parseInsights, parseDemographics, verdictFor, buildReelViews, buildBrief, checkCopy, mondayOf, briefCalendarSpec, CTA, type SnapRow, type PostRow } from '../../src/lib/virat-social';

const snap = (o: Partial<SnapRow>): SnapRow => ({ media_id: 'm', day: '2026-09-30', captured_at: '2026-09-30T03:00:00Z', reach: 100, views: 200, likes: 5, comments: 1, shares: 2, saved: 1, avg_watch_ms: 5000, total_watch_ms: 1e6, ...o });

describe('read-only Graph access', () => {
  it('refuses anything that is not media or insights (no ads, no boosting)', async () => {
    await expect(graphGet('/act_1/ads', {}, 't')).rejects.toThrow(/not allowed/);
    await expect(graphGet('/123/promote', {}, 't')).rejects.toThrow(/not allowed/);
  });
  it('only sends GET', async () => {
    let method = '';
    await graphGet('/123/media', {}, 't', (async (_u: any, init: any) => { method = init.method; return new Response('{"data":[]}'); }) as any);
    expect(method).toBe('GET');
  });
});

describe('parsing', () => {
  it('maps reel insights to columns', () => {
    const s = parseInsights({ data: [{ name: 'reach', values: [{ value: 50 }] }, { name: 'ig_reels_avg_watch_time', values: [{ value: 4200.4 }] }] });
    expect(s.reach).toBe(50); expect(s.avg_watch_ms).toBe(4200);
  });
  it('reads follower demographics breakdowns', () => {
    expect(parseDemographics({ data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ['Mumbai, Maharashtra'], value: 12 }] }] } }] })).toEqual([{ bucket: 'Mumbai, Maharashtra', followers: 12 }]);
  });
});

describe('48h trial verdict', () => {
  const peers = [snap({ avg_watch_ms: 4000, reach: 100, shares: 1 }), snap({ avg_watch_ms: 6000, reach: 300, shares: 3 })];
  it('is too early under 48h', () => {
    expect(verdictFor({ at48: null, posted_at: new Date().toISOString() }, peers).verdict).toBe('too early');
  });
  it('calls a winner and a loser against the median reel', () => {
    expect(verdictFor({ at48: snap({ avg_watch_ms: 7000, reach: 400, shares: 4 }), posted_at: '2026-09-01' }, peers).verdict).toBe('winner');
    expect(verdictFor({ at48: snap({ avg_watch_ms: 1000, reach: 10, shares: 0 }), posted_at: '2026-09-01' }, peers).verdict).toBe('loser');
  });
  it('uses the first snapshot at least 48h after posting', () => {
    const post: PostRow = { media_id: 'a', handle: '@viratemn', product_type: 'REELS', caption: 'ROAS', permalink: null, thumbnail_url: null, posted_at: '2026-09-20T10:00:00Z' };
    const [r] = buildReelViews([post], [snap({ media_id: 'a', captured_at: '2026-09-21T03:00:00Z', reach: 1 }), snap({ media_id: 'a', captured_at: '2026-09-23T03:00:00Z', reach: 2 }), snap({ media_id: 'a', captured_at: '2026-09-25T03:00:00Z', reach: 3 })]);
    expect(r.at48?.reach).toBe(2); expect(r.latest?.reach).toBe(3);
  });
});

describe('weekly brief rules', () => {
  it('flags money, raw numbers, food, brand names and a missing CTA', () => {
    expect(checkCopy('₹2 lakh in sales')).toContain(`Must end "${CTA}"`);
    expect(checkCopy(`We did 1200 orders. ${CTA}`).join()).toMatch(/percentages only/);
    expect(checkCopy(`Cloud kitchen tips. ${CTA}`).join()).toMatch(/Food/);
    expect(checkCopy(`How Ceremony Kitchen grew +200%. ${CTA}`, ['Ceremony Kitchen']).join()).toMatch(/Names a brand/);
    expect(checkCopy(`+200% ROAS for a D2C brand. ${CTA}`)).toEqual([]);
  });
  it('gives 3 distinct ideas that pass every rule, even with no data', () => {
    const ideas = buildBrief([], '2026-09-28', ['Ceremony Kitchen', 'Travaholic Caps']);
    expect(ideas).toHaveLength(3);
    expect(new Set(ideas.map((i) => i.hook)).size).toBe(3);
    for (const i of ideas) { expect(checkCopy(i.caption)).toEqual([]); expect(i.beats.at(-1)).toContain(CTA); }
  });
  it('fits the content & performance calendar spec, organic only', () => {
    const spec = briefCalendarSpec(buildBrief([], '2026-09-28'), '2026-09-28');
    expect(spec.weeks[0].days).toHaveLength(7);
    expect(spec.weeks[0].days.filter((d: any) => d.post)).toHaveLength(3);
    expect(spec.performance.campaigns.every((c) => c.budget === '₹0')).toBe(true);
  });
  it('finds the Monday in IST terms', () => { expect(mondayOf('2026-09-30')).toBe('2026-09-28'); expect(mondayOf('2026-10-04')).toBe('2026-09-28'); });
});
