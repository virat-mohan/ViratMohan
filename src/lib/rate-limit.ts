// Small in-memory sliding-window limiter for the public endpoints. No dependency, no database writes.
// It is per server instance: it stops one client hammering a warm instance, not a distributed attack.
export interface RateRule { limit: number; windowMs: number }
export interface RateDecision { allowed: boolean; retryAfterSeconds: number }
export interface RateLimiter { check(key: string | null): RateDecision }

export function createRateLimiter(opts: { rules: RateRule[]; now?: () => number; maxKeys?: number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 5000;
  const horizon = Math.max(...opts.rules.map((r) => r.windowMs));
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      // A client that cannot be told apart is allowed: a shared bucket would lock every visitor out together.
      if (!key) return { allowed: true, retryAfterSeconds: 0 };
      const t = now();
      const log = (hits.get(key) ?? []).filter((x) => t - x < horizon);

      let waitMs = 0;
      for (const r of opts.rules) {
        const inWindow = log.filter((x) => t - x < r.windowMs);
        if (inWindow.length >= r.limit) waitMs = Math.max(waitMs, inWindow[inWindow.length - r.limit] + r.windowMs - t);
      }

      hits.delete(key);
      if (waitMs > 0) {
        hits.set(key, log);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
      }
      hits.set(key, [...log, t]);
      while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

/** A 429 response when the client is over its limit, otherwise null. A limiter fault lets the request through. */
export function limitedResponse(limiter: RateLimiter, key: string | null, body: unknown): Response | null {
  try {
    const d = limiter.check(key);
    if (d.allowed) return null;
    return new Response(JSON.stringify(body), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(d.retryAfterSeconds) } });
  } catch (e) {
    console.error('rate limiter failed open', e);
    return null;
  }
}
