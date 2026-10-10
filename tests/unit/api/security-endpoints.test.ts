// The real handlers for /api/partners/apply, /api/leads/resend-link and /api/dashboard/request, with only their I/O
// (database store, mail, notifier, environment) replaced by recorders. Rate limiters are per module instance, so each
// test re-imports the handlers (vi.resetModules) for a fresh limiter and moves the clock with fake Date.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const LEAD_EMAIL = 'founder@lead-brand.example';
const APPROVER = 'virat-approver@example.com';
const PASSWORD = 'correct-horse-battery';
const rec = {
  env: {} as Record<string, string>,
  leads: [] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
  tokens: [] as { n: string; m: string }[],
  byLead: {} as Record<string, Record<string, unknown>[]>,
  emails: [] as { to: string; subject: string; html: string }[],
  notices: [] as Record<string, unknown>[],
  failCreate: false,
  failMessages: false,
};

vi.mock('../../../src/lib/env', () => ({ getEnv: () => rec.env }));
vi.mock('../../../src/lib/ledger', () => ({ serviceDb: () => ({}) }));
vi.mock('../../../src/lib/mail/send', () => ({ mailConfigured: () => true }));
vi.mock('../../../src/lib/email', () => ({
  sendEmail: async (m: { to: string; subject: string; html: string }) => { rec.emails.push(m); },
}));
vi.mock('../../../src/lib/lead-mail/live', () => ({
  viratNotifier: () => async (n: Record<string, unknown>) => { rec.notices.push(n); },
}));
vi.mock('../../../src/lib/lead-mail/store', () => ({
  SupabaseLeadStore: class {
    async createLead(l: Record<string, unknown>) {
      if (rec.failCreate) throw new Error('postgres://secret-db-detail');
      rec.leads.push(l);
      return { id: 'lead-1', ...l };
    }
    async insertMessage(m: Record<string, unknown>) { rec.messages.push(m); return { id: 'm-new', ...m }; }
    async messagesFor(id: string) {
      if (rec.failMessages) throw new Error('postgres://secret-db-detail');
      return [...(rec.byLead[id] ?? [])];
    }
    async saveToken(n: string, m: string) { rec.tokens.push({ n, m }); }
  },
}));

const post = (url: string, body: unknown, ip: string, headers: Record<string, string> = {}, raw = false) =>
  new Request(`http://x${url}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...headers }, body: raw ? (body as string) : JSON.stringify(body) });
const basic = (pw: string) => ({ authorization: 'Basic ' + btoa(`admin:${pw}`) });
const run = async (mod: string, request: Request) => {
  const { POST } = await import(mod);
  const res: Response = await POST({ request });
  const text = await res.text();
  return { res, text, json: text ? JSON.parse(text) : null };
};
const APPLY = '../../../src/pages/api/partners/apply';
const RESEND = '../../../src/pages/api/leads/resend-link';
const DASH = '../../../src/pages/api/dashboard/request';
const application = { brand_name: 'Acme Candles', contact_name: 'Fay Ng', contact_email: 'fay@acme.example', motivation: 'We make candles.' };

beforeEach(() => {
  rec.env = { ADMIN_NOTIFY_EMAIL: APPROVER, LEAD_APPROVAL_SECRET: 'approval-secret', ADMIN_PASSWORD: PASSWORD };
  rec.leads = []; rec.messages = []; rec.tokens = []; rec.emails = []; rec.notices = [];
  rec.byLead = {}; rec.failCreate = false; rec.failMessages = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
  vi.resetModules();
});

describe('POST /api/partners/apply', () => {
  it('a normal application creates one lead, one internal note, and notifies the approver once', async () => {
    const { res, json } = await run(APPLY, post('/a', application, '1.1.1.1'));
    expect(res.status).toBe(201);
    expect(json).toEqual({ ok: true, leadId: 'lead-1' });
    expect(rec.leads).toHaveLength(1);
    expect(rec.leads[0]).toMatchObject({ brand_name: 'Acme Candles', contact_email: 'fay@acme.example', stage: 'new' });
    expect(rec.messages).toHaveLength(1);
    expect(rec.messages[0]).toMatchObject({ lead_id: 'lead-1', direction: 'internal', channel: 'note', status: 'logged' });
    expect(rec.notices).toHaveLength(1);
    expect(rec.emails).toHaveLength(0);
  });

  it.each([
    ['malformed JSON', '{not json', 400],
    ['missing fields', { brand_name: 'Only a name' }, 400],
    ['an invalid email', { ...application, contact_email: 'not-an-email' }, 400],
    ['an over-long brand name', { ...application, brand_name: 'x'.repeat(201) }, 400],
    ['an over-long motivation', { ...application, motivation: 'x'.repeat(2001) }, 400],
  ])('rejects %s with %i and writes nothing', async (_n, body, status) => {
    const { res } = await run(APPLY, post('/a', body, '2.2.2.2', {}, typeof body === 'string'));
    expect(res.status).toBe(status);
    expect(rec.leads).toHaveLength(0);
    expect(rec.messages).toHaveLength(0);
    expect(rec.notices).toHaveLength(0);
  });

  it('rejects a body declared over 10 KB with 413 and writes nothing', async () => {
    const { res } = await run(APPLY, post('/a', application, '3.3.3.3', { 'content-length': String(11 * 1024) }));
    expect(res.status).toBe(413);
    expect(rec.leads).toHaveLength(0);
  });

  it('a database failure is a generic 500 that leaks no internal detail', async () => {
    rec.failCreate = true;
    const { res, text } = await run(APPLY, post('/a', application, '4.4.4.4'));
    expect(res.status).toBe(500);
    expect(text).not.toContain('postgres');
    expect(text).not.toContain('secret');
  });

  it('a second application from the same client inside a minute is 429 with Retry-After and writes nothing; another client and a later minute are fine', async () => {
    const { POST } = await import(APPLY);
    const go = (ip: string) => POST({ request: post('/a', application, ip) }) as Promise<Response>;
    expect((await go('5.5.5.5')).status).toBe(201);
    const blocked = await go('5.5.5.5');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(rec.leads).toHaveLength(1);
    expect((await go('6.6.6.6')).status).toBe(201);
    vi.setSystemTime(new Date('2026-10-07T00:01:05Z'));
    expect((await go('5.5.5.5')).status).toBe(201);
    expect(rec.leads).toHaveLength(3);
  });

  it('caps a client at 5 applications an hour even when each is a minute apart', async () => {
    const { POST } = await import(APPLY);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(new Date(Date.parse('2026-10-07T00:00:00Z') + i * 61_000));
      codes.push(((await POST({ request: post('/a', application, '7.7.7.7') })) as Response).status);
    }
    expect(codes).toEqual([201, 201, 201, 201, 201, 429]);
  });
});

describe('POST /api/leads/resend-link', () => {
  const pending = { id: 'm-1', lead_id: 'lead-9', status: 'awaiting_approval', subject: 'Re: your question', body: 'Hello Fay.\nSecond line.', direction: 'outbound' };

  it('emails a fresh single-use approval link to the approver only, never to the lead, and saves its token', async () => {
    rec.byLead['lead-9'] = [pending];
    const { res, json } = await run(RESEND, post('/r', { leadId: 'lead-9' }, '1.1.1.1'));
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(rec.emails).toHaveLength(1);
    expect(rec.emails[0].to).toBe(APPROVER);
    expect(rec.emails.some((e) => e.to === LEAD_EMAIL)).toBe(false);
    expect(rec.emails[0].html).toContain('/api/leads/approve?t=');
    expect(rec.tokens).toHaveLength(1);
    expect(rec.tokens[0].m).toBe('m-1');
  });

  it('gives the same answer and sends nothing for an unknown lead, so existence is not revealed', async () => {
    rec.byLead['lead-9'] = [pending];
    const known = await run(RESEND, post('/r', { leadId: 'lead-9' }, '2.2.2.2'));
    const unknown = await run(RESEND, post('/r', { leadId: 'nope' }, '2.2.2.3'));
    expect(unknown.res.status).toBe(known.res.status);
    expect(unknown.text).toBe(known.text);
    expect(rec.emails).toHaveLength(1);
  });

  it('sends nothing when the lead has no message awaiting approval', async () => {
    rec.byLead['lead-9'] = [{ ...pending, status: 'sent' }];
    const { json } = await run(RESEND, post('/r', { leadId: 'lead-9' }, '3.3.3.3'));
    expect(json).toEqual({ ok: true });
    expect(rec.emails).toHaveLength(0);
    expect(rec.tokens).toHaveLength(0);
  });

  it('sends nothing when no approval secret is configured', async () => {
    rec.env.LEAD_APPROVAL_SECRET = '';
    rec.byLead['lead-9'] = [pending];
    const { res } = await run(RESEND, post('/r', { leadId: 'lead-9' }, '4.4.4.4'));
    expect(res.status).toBe(200);
    expect(rec.emails).toHaveLength(0);
  });

  it.each([['malformed JSON', '{oops', true], ['a missing leadId', {}, false]])('rejects %s with 400', async (_n, body, raw) => {
    const { res } = await run(RESEND, post('/r', body, '5.5.5.5', {}, raw as boolean));
    expect(res.status).toBe(400);
    expect(rec.emails).toHaveLength(0);
  });

  it('a store failure still answers ok and leaks nothing', async () => {
    rec.failMessages = true;
    const { res, text } = await run(RESEND, post('/r', { leadId: 'lead-9' }, '6.6.6.6'));
    expect(res.status).toBe(200);
    expect(text).toBe('{"ok":true}');
  });

  it('allows 3 a minute, then 429; a different client is unaffected; the limit resets after a minute', async () => {
    rec.byLead['lead-9'] = [pending];
    const { POST } = await import(RESEND);
    const go = (ip: string) => POST({ request: post('/r', { leadId: 'lead-9' }, ip) }) as Promise<Response>;
    expect([(await go('7.7.7.7')).status, (await go('7.7.7.7')).status, (await go('7.7.7.7')).status]).toEqual([200, 200, 200]);
    const blocked = await go('7.7.7.7');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(rec.emails).toHaveLength(3);
    expect((await go('8.8.8.8')).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-07T00:01:05Z'));
    expect((await go('7.7.7.7')).status).toBe(200);
  });
});

describe('POST /api/dashboard/request', () => {
  const op = { operationType: 'approve_workflow', operationId: 'wf-123', payload: { a: 1 } };

  it('an authorised, valid request is acknowledged', async () => {
    const { res, json } = await run(DASH, post('/d', op, '1.1.1.1', basic(PASSWORD)));
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, operationType: 'approve_workflow', operationId: 'wf-123' });
  });

  it.each([
    ['no credentials', {}],
    ['the wrong password', basic('wrong')],
    ['a bearer token carrying the password (not the accepted scheme)', { authorization: `Bearer ${PASSWORD}` }],
  ])('refuses %s with 401', async (_n, headers) => {
    const { res, text } = await run(DASH, post('/d', op, '2.2.2.2', headers as Record<string, string>));
    expect(res.status).toBe(401);
    expect(text).not.toContain(PASSWORD);
  });

  it('fails closed with 503 when no admin password is configured, even for a request that sends an empty one', async () => {
    rec.env.ADMIN_PASSWORD = '';
    const { res } = await run(DASH, post('/d', op, '3.3.3.3', basic('')));
    expect(res.status).toBe(503);
  });

  it.each([
    ['malformed JSON', '{oops', true, 400],
    ['a missing operationId', { operationType: 'x' }, false, 400],
    ['an over-long operationType', { operationType: 'x'.repeat(101), operationId: 'a' }, false, 400],
  ])('after auth, rejects %s with %i', async (_n, body, raw, status) => {
    const { res } = await run(DASH, post('/d', body, '4.4.4.4', basic(PASSWORD), raw as boolean));
    expect(res.status).toBe(status);
  });

  it('rejects a body declared over 50 KB with 413 before checking anything else', async () => {
    const { res } = await run(DASH, post('/d', op, '5.5.5.5', { ...basic(PASSWORD), 'content-length': String(51 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('allows 20 a minute, then 429 even with valid credentials; another client is unaffected; resets after a minute', async () => {
    const { POST } = await import(DASH);
    const go = (ip: string) => POST({ request: post('/d', op, ip, basic(PASSWORD)) }) as Promise<Response>;
    for (let i = 0; i < 20; i++) expect((await go('6.6.6.6')).status).toBe(200);
    const blocked = await go('6.6.6.6');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect((await go('9.9.9.9')).status).toBe(200);
    vi.setSystemTime(new Date('2026-10-07T00:01:05Z'));
    expect((await go('6.6.6.6')).status).toBe(200);
  });

  it('counts failed logins against the limit, so guessing the password is throttled', async () => {
    const { POST } = await import(DASH);
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push(((await POST({ request: post('/d', op, '7.7.7.7', basic(`guess-${i}`)) })) as Response).status);
    expect(codes.slice(0, 20).every((c) => c === 401)).toBe(true);
    expect(codes[20]).toBe(429);
  });
});

describe('rate-limit isolation across endpoints', () => {
  it('exhausting one endpoint for a client does not limit that client on another', async () => {
    const apply = await import(APPLY);
    const resend = await import(RESEND);
    expect(((await apply.POST({ request: post('/a', application, '10.0.0.1') })) as Response).status).toBe(201);
    expect(((await apply.POST({ request: post('/a', application, '10.0.0.1') })) as Response).status).toBe(429);
    expect(((await resend.POST({ request: post('/r', { leadId: 'x' }, '10.0.0.1') })) as Response).status).toBe(200);
  });
});
