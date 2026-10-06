import { describe, expect, it } from 'vitest';
import { createRateLimiter, limitedResponse } from '../../src/lib/rate-limit';

function clock(start = 1_000_000) { let t = start; return { now: () => t, advance: (ms: number) => { t += ms; } }; }
const rules = [{ limit: 3, windowMs: 60_000 }, { limit: 5, windowMs: 3_600_000 }];

describe('rate limiter', () => {
  it('a normal request is allowed', () => {
    const l = createRateLimiter({ rules, now: clock().now });
    expect(l.check('1.1.1.1')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('a burst is limited at the burst rule, with an accurate retry time', () => {
    const c = clock(); const l = createRateLimiter({ rules, now: c.now });
    expect([1, 2, 3].map(() => l.check('a').allowed)).toEqual([true, true, true]);
    c.advance(10_000);
    const d = l.check('a');
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBe(50);
  });

  it('separate clients are isolated', () => {
    const l = createRateLimiter({ rules, now: clock().now });
    for (let i = 0; i < 3; i++) l.check('a');
    expect(l.check('a').allowed).toBe(false);
    expect(l.check('b').allowed).toBe(true);
  });

  it('a later request succeeds once the window has passed', () => {
    const c = clock(); const l = createRateLimiter({ rules, now: c.now });
    for (let i = 0; i < 3; i++) l.check('a');
    expect(l.check('a').allowed).toBe(false);
    c.advance(60_001);
    expect(l.check('a').allowed).toBe(true);
  });

  it('refused requests are not counted, so hammering cannot extend the lockout', () => {
    const c = clock(); const l = createRateLimiter({ rules, now: c.now });
    for (let i = 0; i < 3; i++) l.check('a');
    for (let i = 0; i < 50; i++) { c.advance(500); l.check('a'); }
    c.advance(60_000);
    expect(l.check('a').allowed).toBe(true);
  });

  it('the hourly rule holds after the minute rule recovers', () => {
    const c = clock(); const l = createRateLimiter({ rules, now: c.now });
    for (let i = 0; i < 5; i++) { expect(l.check('a').allowed).toBe(true); c.advance(61_000); }
    const d = l.check('a');
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBeGreaterThan(60);
  });

  it('a client that cannot be identified is allowed rather than locking everyone out', () => {
    const l = createRateLimiter({ rules, now: clock().now });
    for (let i = 0; i < 20; i++) expect(l.check(null).allowed).toBe(true);
  });

  it('memory is bounded: the least recently used client is forgotten past maxKeys', () => {
    const l = createRateLimiter({ rules, now: clock().now, maxKeys: 3 });
    for (let i = 0; i < 3; i++) l.check('a');
    expect(l.check('a').allowed).toBe(false);
    for (const k of ['b', 'c', 'd']) l.check(k);
    expect(l.check('a').allowed).toBe(true);
  });
});

describe('limitedResponse', () => {
  it('returns a 429 with Retry-After and the given body, or null when allowed', async () => {
    const l = createRateLimiter({ rules: [{ limit: 1, windowMs: 60_000 }], now: clock().now });
    expect(limitedResponse(l, 'a', { error: 'x' })).toBeNull();
    const r = limitedResponse(l, 'a', { error: 'slow down' })!;
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(await r.json()).toEqual({ error: 'slow down' });
  });

  it('a limiter fault lets the request through', () => {
    const broken = { check: () => { throw new Error('boom'); } };
    expect(limitedResponse(broken, 'a', {})).toBeNull();
  });
});
