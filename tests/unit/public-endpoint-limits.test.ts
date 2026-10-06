// The expensive and mail-sending public routes, with their I/O replaced. A limited request must do no work at all.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rec = { models: 0, emails: 0, inserts: 0, lookups: 0 };

vi.mock('../../src/lib/env', () => ({ getEnv: () => ({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', ANTHROPIC_API_KEY: 'a', ADMIN_NOTIFY_EMAIL: 'admin@example.com' }) }));
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { void p; } }));
vi.mock('../../src/lib/llm', () => ({
  classifyAndBuild: async () => { rec.models++; throw new Error('not reached in these tests'); },
  fetchWebsiteSnippet: async () => null, resolveFrameworkSelections: () => [], resolveAgentSequence: () => [],
}));
vi.mock('../../src/lib/email', () => ({ sendEmail: async () => { rec.emails++; } }));
vi.mock('../../src/lib/demo-email', () => ({ sendDemoDoneEmail: async () => { rec.emails++; } }));
vi.mock('../../src/lib/db', () => ({
  getDb: () => ({
    findRecentDuplicateSubmission: async () => { rec.lookups++; return { id: 'sub-1', status: 'demo_ready', artefact_html: '<p>x</p>' }; },
    insertSubmission: async () => { rec.inserts++; },
  }),
}));
vi.mock('../../src/lib/retail-os-db', () => ({ getRetailOsDb: () => ({ findLatestByEmail: async () => { rec.lookups++; return { id: 'a1', brand_name: 'Acme', founder_email: 'fay@example.com' }; } }) }));
vi.mock('../../src/lib/mail/send', () => ({ mailConfigured: () => true }));

const post = (url: string, body: unknown, ip: string) => new Request(`http://x${url}`, { method: 'POST', headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const intake = { problem: 'Our checkout abandons at sixty percent and nobody knows why it happens', email: 'fay@example.com' };

beforeEach(() => { Object.assign(rec, { models: 0, emails: 0, inserts: 0, lookups: 0 }); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-07T00:00:00Z')); vi.resetModules(); });

describe('devshop intake (a model call and mail behind a public form)', () => {
  it('the third request in a minute is refused before any lookup, model call, write or email', async () => {
    const { POST } = await import('../../src/pages/devshop/api/intake');
    for (let i = 0; i < 2; i++) expect((await POST({ request: post('/devshop/api/intake', intake, '1.1.1.1') } as never)).status).toBe(200);
    const before = { ...rec };
    const res = await POST({ request: post('/devshop/api/intake', intake, '1.1.1.1') } as never);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(rec).toEqual(before);
  });

  it('another client is unaffected, and the first can submit again after the window', async () => {
    const { POST } = await import('../../src/pages/devshop/api/intake');
    for (let i = 0; i < 3; i++) await POST({ request: post('/devshop/api/intake', intake, '2.2.2.2') } as never);
    expect((await POST({ request: post('/devshop/api/intake', intake, '3.3.3.3') } as never)).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-07T00:01:10Z'));
    expect((await POST({ request: post('/devshop/api/intake', intake, '2.2.2.2') } as never)).status).toBe(200);
  });

  it('malformed bodies count against the allowance', async () => {
    const { POST } = await import('../../src/pages/devshop/api/intake');
    const bad = () => new Request('http://x/devshop/api/intake', { method: 'POST', headers: { 'x-forwarded-for': '4.4.4.4' }, body: 'not json' });
    expect((await POST({ request: bad() } as never)).status).toBe(400);
    expect((await POST({ request: bad() } as never)).status).toBe(400);
    expect((await POST({ request: post('/devshop/api/intake', intake, '4.4.4.4') } as never)).status).toBe(429);
    expect(rec.lookups).toBe(0);
  });
});

describe('resend-link (mail to an address that has an application)', () => {
  it('is limited, and the refusal does not reveal whether the address has an application', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/resend-link');
    for (let i = 0; i < 3; i++) expect((await POST({ request: post('/retail-os/api/resend-link', { email: 'fay@example.com' }, '5.5.5.5') } as never)).status).toBe(200);
    const emails = rec.emails;
    const known = await POST({ request: post('/retail-os/api/resend-link', { email: 'fay@example.com' }, '5.5.5.5') } as never);
    const unknown = await POST({ request: post('/retail-os/api/resend-link', { email: 'nobody@example.com' }, '5.5.5.5') } as never);
    expect(known.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(await known.text()).toBe(await unknown.text());
    expect(rec.emails).toBe(emails);
  });
});
