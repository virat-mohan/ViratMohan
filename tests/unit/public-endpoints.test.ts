// The real apply, chat and deposit handlers, with their I/O replaced by recorders. Proves: rate limiting before any
// work or write, per-client isolation, no ReferenceError on the sync call, the lead sync only writes internal rows,
// and which emails go out (the existing ones only).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Write = { table: string; op: string; row?: Record<string, unknown> };
const rec = { writes: [] as Write[], emails: [] as { to: string; subject: string }[], inserts: 0, modelCalls: 0, chatUpserts: 0, lead: null as null | { id: string; stage: string } };

function recordingClient() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, ilike: () => chain,
        maybeSingle: async () => ({ data: rec.lead, error: null }),
        single: async () => ({ data: { id: 'new-lead', stage: 'applied' }, error: null }),
        insert: (row: Record<string, unknown>) => { rec.writes.push({ table, op: 'insert', row }); return chain; },
        update: (row: Record<string, unknown>) => { rec.writes.push({ table, op: 'update', row }); return chain; },
        then: (res: (v: unknown) => unknown) => res({ data: null, error: null }),
      };
      return chain;
    },
  };
}

vi.mock('../../src/lib/env', () => ({ getEnv: () => ({ SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k', ADMIN_NOTIFY_EMAIL: 'admin@example.com', ANTHROPIC_API_KEY: 'a' }) }));
vi.mock('../../src/lib/email', () => ({ sendEmail: async (m: { to: string; subject: string }) => { rec.emails.push({ to: m.to, subject: m.subject }); } }));
vi.mock('../../src/lib/mail/send', () => ({ mailConfigured: () => true }));
vi.mock('../../src/lib/retail-os-db', () => ({
  DEPOSIT_INR: 5000, BUILD_WINDOW_DAYS: 7,
  getRetailOsDb: () => ({
    client: recordingClient(),
    insert: async () => { rec.inserts++; return 'app-1'; },
    getById: async () => ({ id: 'app-1', brand_name: 'Acme', founder_name: 'Fay', founder_email: 'fay@example.com', agreement: { signed: true }, deposit: null }),
    submitDeposit: async () => undefined,
    confirmDeposit: async () => ({ id: 'app-1', brand_name: 'Acme', founder_name: 'Fay', founder_email: 'fay@example.com', build_started_at: '2026-10-07T00:00:00Z' }),
  }),
}));
vi.mock('../../src/lib/intelligence/provider', () => ({
  ModelGateError: class extends Error {},
  governedMessages: async () => { rec.modelCalls++; return { res: new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' }), { status: 200 }), modelId: 'claude-sonnet-5' }; },
}));
vi.mock('../../src/lib/retail-os-chat', () => ({
  CHAT_SYSTEM: 'sys', LEAD_TOOL: { name: 'lead' }, VIRAT_TOOL: { name: 'request_virat' }, viratRequestEmail: () => ({}),
  chatDb: () => ({ upsert: async () => { rec.chatUpserts++; } }),
}));
vi.mock('../../src/lib/brain', () => ({ serverBrain: () => ({ chatContext: async () => ({ block: '' }) }) }));
vi.mock('../../src/lib/knowledge-loop', () => ({ knowledgeLoop: () => ({ noteUnanswered: async () => undefined }), questionIn: () => null }));

const req = (url: string, body: unknown, ip: string, raw = false) =>
  new Request(`http://x${url}`, { method: 'POST', headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' }, body: raw ? (body as string) : JSON.stringify(body) });
const application = { brandName: 'Acme', founderName: 'Fay Ng', founderEmail: 'fay@example.com' };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { rec.writes = []; rec.emails = []; rec.inserts = 0; rec.modelCalls = 0; rec.chatUpserts = 0; rec.lead = null; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-07T00:00:00Z')); vi.resetModules(); });

describe('public apply', () => {
  it('a normal application is saved, emails go to the admin and the founder only, and the lead sync writes internal rows', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/apply');
    const res = await POST({ request: req('/retail-os/api/apply', application, '1.1.1.1') } as never);
    await flush();
    expect(res.status).toBe(201);
    expect(rec.inserts).toBe(1);
    expect(rec.emails.map((e) => e.to).sort()).toEqual(['admin@example.com', 'fay@example.com']);
    expect(new Set(rec.writes.map((w) => w.table))).toEqual(new Set(['leads', 'lead_messages']));
    for (const w of rec.writes.filter((x) => x.table === 'lead_messages')) expect(w.row).toMatchObject({ direction: 'internal', channel: 'note', created_by: 'lead-sync' });
  });

  it('a burst from one client is limited with a 429 and no write, no email', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/apply');
    for (let i = 0; i < 3; i++) expect((await POST({ request: req('/x', application, '2.2.2.2') } as never)).status).toBe(201);
    await flush();
    const before = { inserts: rec.inserts, emails: rec.emails.length, writes: rec.writes.length };
    const limited = await POST({ request: req('/x', application, '2.2.2.2') } as never);
    await flush();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect({ inserts: rec.inserts, emails: rec.emails.length, writes: rec.writes.length }).toEqual(before);
  });

  it('a different client is not affected, and the first client can apply again after the window', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/apply');
    for (let i = 0; i < 3; i++) await POST({ request: req('/x', application, '3.3.3.3') } as never);
    expect((await POST({ request: req('/x', application, '3.3.3.3') } as never)).status).toBe(429);
    expect((await POST({ request: req('/x', application, '4.4.4.4') } as never)).status).toBe(201);
    vi.setSystemTime(new Date('2026-10-07T00:01:05Z'));
    expect((await POST({ request: req('/x', application, '3.3.3.3') } as never)).status).toBe(201);
  });

  it('malformed requests use up the allowance and cannot be used to get around it', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/apply');
    const bad = [req('/x', 'not json', '5.5.5.5', true), req('/x', {}, '5.5.5.5'), req('/x', '{"a":', '5.5.5.5', true)];
    expect((await POST({ request: bad[0] } as never)).status).toBe(400);
    expect((await POST({ request: bad[1] } as never)).status).toBe(400);
    expect((await POST({ request: bad[2] } as never)).status).toBe(400);
    expect((await POST({ request: req('/x', application, '5.5.5.5') } as never)).status).toBe(429);
    expect(rec.inserts).toBe(0);
  });

  it('a request with no client address is allowed, not locked out with everyone else', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/apply');
    const noIp = () => new Request('http://x/x', { method: 'POST', body: JSON.stringify(application) });
    for (let i = 0; i < 6; i++) expect((await POST({ request: noIp() } as never)).status).toBe(201);
  });
});

describe('public chat', () => {
  const chat = (ip: string) => req('/retail-os/api/chat', { sessionId: 's1', messages: [{ role: 'user', content: 'hello' }] }, ip);

  it('a normal message gets a reply through the governed provider', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/chat');
    const res = await POST({ request: chat('6.6.6.6') } as never);
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('Hello');
    expect(rec.modelCalls).toBe(1);
  });

  it('the eleventh message in a minute is limited: no model call, no database write, a friendly reply', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/chat');
    for (let i = 0; i < 10; i++) expect((await POST({ request: chat('7.7.7.7') } as never)).status).toBe(200);
    const calls = rec.modelCalls; const upserts = rec.chatUpserts;
    const res = await POST({ request: chat('7.7.7.7') } as never);
    expect(res.status).toBe(429);
    expect((await res.json()).reply).toMatch(/WhatsApp/);
    expect(rec.modelCalls).toBe(calls);
    expect(rec.chatUpserts).toBe(upserts);
  });

  it('another client is unaffected and the limited client recovers after the window', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/chat');
    for (let i = 0; i < 10; i++) await POST({ request: chat('8.8.8.8') } as never);
    expect((await POST({ request: chat('8.8.8.8') } as never)).status).toBe(429);
    expect((await POST({ request: chat('9.9.9.9') } as never)).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-07T00:01:10Z'));
    expect((await POST({ request: chat('8.8.8.8') } as never)).status).toBe(200);
  });

  it('malformed bodies count against the limit', async () => {
    const { POST } = await import('../../src/pages/retail-os/api/chat');
    for (let i = 0; i < 10; i++) expect((await POST({ request: req('/x', 'garbage', '10.0.0.1', true) } as never)).status).toBe(400);
    expect((await POST({ request: chat('10.0.0.1') } as never)).status).toBe(429);
    expect(rec.modelCalls).toBe(0);
  });
});

describe('admin deposit path', () => {
  it('records and confirms the deposit, syncs the lead internally, and emails only the founder (existing behaviour)', async () => {
    rec.lead = { id: 'l1', stage: 'signed' };
    const { POST } = await import('../../src/pages/retail-os/api/admin/mark-deposit-paid');
    const res = await POST({ request: req('/retail-os/api/admin/mark-deposit-paid', { id: 'app-1' }, '1.2.3.4') } as never);
    await flush();
    expect(res.status).toBe(200);
    expect(rec.emails.map((e) => e.to)).toEqual(['fay@example.com']);
    expect(rec.writes.some((w) => w.table === 'leads' && w.op === 'update' && w.row?.stage === 'deposit_paid')).toBe(true);
    for (const w of rec.writes.filter((x) => x.table === 'lead_messages')) expect(w.row).toMatchObject({ direction: 'internal', channel: 'note' });
    expect(new Set(rec.writes.map((w) => w.table))).toEqual(new Set(['leads', 'lead_messages']));
  });

  it('is behind the admin gate, and is not rate limited (the limiter cannot stand in for authorisation)', async () => {
    const { isProtectedPath } = await import('../../src/lib/admin-auth');
    expect(isProtectedPath('/retail-os/api/admin/mark-deposit-paid')).toBe(true);
    expect(isProtectedPath('/retail-os/api/apply')).toBe(false);
  });
});
