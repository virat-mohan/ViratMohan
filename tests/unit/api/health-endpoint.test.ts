// The real GET /api/health handler with the database, environment and mail replaced by controllable fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'sentinel-secret-value-do-not-leak';
type Result = { error: unknown } | 'throw';
const state = {
  env: {} as Record<string, string>,
  tables: {} as Record<string, Result>,
  mail: true as boolean | 'throw',
};
const healthyEnv = () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: SECRET, LEAD_TOKEN_SECRET: SECRET });

vi.mock('../../../src/lib/env', () => ({ getEnv: () => state.env }));
vi.mock('../../../src/lib/mail/send', () => ({
  mailConfigured: () => { if (state.mail === 'throw') throw new Error(`boom ${SECRET}`); return state.mail; },
}));
vi.mock('../../../src/lib/ledger', () => ({
  serviceDb: () => ({
    from: (table: string) => ({
      select: () => ({
        limit: async () => {
          const r = state.tables[table] ?? { error: null };
          if (r === 'throw') throw new Error(`down ${SECRET}`);
          return r;
        },
      }),
    }),
  }),
}));

async function call() {
  const { GET } = await import('../../../src/pages/api/health');
  const res = await (GET as (c: unknown) => Promise<Response>)({});
  const text = await res.text();
  return { res, text, body: JSON.parse(text) as { ok: boolean; status: string; timestamp: string; checks: { name: string; ok: boolean; error?: string }[] } };
}
const check = (b: Awaited<ReturnType<typeof call>>['body'], name: string) => b.checks.find((c) => c.name === name)!;

beforeEach(() => { state.env = healthyEnv(); state.tables = {}; state.mail = true; vi.resetModules(); });

describe('GET /api/health', () => {
  it('is 200 and healthy when the database, environment and mail are all fine', async () => {
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ ok: true, status: 'healthy' });
    expect(body.checks.map((c) => c.name)).toEqual(['Supabase', 'Environment', 'Email']);
    expect(body.checks.every((c) => c.ok)).toBe(true);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('is 503 when the database returns an error (bad credentials or missing table), which the old check ignored', async () => {
    state.tables.leads = { error: { message: 'Invalid API key' } };
    const { res, body } = await call();
    expect(res.status).toBe(503);
    expect(body).toMatchObject({ ok: false, status: 'unhealthy' });
    expect(check(body, 'Supabase')).toEqual({ name: 'Supabase', ok: false, error: 'Cannot connect to database' });
  });

  it('is 503 when the database is unreachable and the client throws', async () => {
    state.tables.leads = 'throw';
    const { res, body } = await call();
    expect(res.status).toBe(503);
    expect(check(body, 'Supabase').ok).toBe(false);
  });

  it('is 503 and names the missing variables (names only) when critical configuration is absent', async () => {
    state.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: '', LEAD_TOKEN_SECRET: '' };
    const { res, body } = await call();
    expect(res.status).toBe(503);
    expect(check(body, 'Environment').error).toBe('Missing: SUPABASE_SERVICE_ROLE_KEY, LEAD_TOKEN_SECRET');
  });

  it('is 200 and degraded, not healthy, when only mail is unavailable', async () => {
    state.mail = false;
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'degraded' });
    expect(check(body, 'Email')).toEqual({ name: 'Email', ok: false, error: 'Not configured' });
  });

  it('treats a throwing mail check as degraded, not a crash', async () => {
    state.mail = 'throw';
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(check(body, 'Email').error).toBe('Configuration check failed');
  });

  it('never puts a secret or a raw error message in any response', async () => {
    for (const setup of [() => { state.tables.leads = 'throw'; }, () => { state.tables.leads = { error: { message: SECRET } }; }, () => { state.mail = 'throw'; }, () => { state.env = { ...healthyEnv(), LEAD_TOKEN_SECRET: '' }; }]) {
      state.env = healthyEnv(); state.tables = {}; state.mail = true; setup();
      vi.resetModules();
      const { text } = await call();
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('boom');
    }
  });
});
