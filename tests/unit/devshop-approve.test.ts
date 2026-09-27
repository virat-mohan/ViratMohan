import { describe, it, expect, vi, beforeEach } from 'vitest';

// The admin "Approve & send" route: one send per demo_ready row, always to the
// address on the submission. Auth is the middleware's job (see admin-auth.test.ts).
const sendEmail = vi.fn(async () => ({ id: 'e1' }));
vi.mock('../../src/lib/email', () => ({ sendEmail, escapeHtml: (s: string) => s }));
vi.mock('../../src/lib/env', () => ({ getEnv: () => ({ SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', INBOUND_EMAIL_DOMAIN: '' }) }));

let row: any;
vi.mock('../../src/lib/db', () => ({
  getDb: () => ({
    getById: async (id: string) => (row && row.id === id ? row : null),
    markSent: async () => { row.status = 'sent'; },
  }),
}));

const { POST } = await import('../../src/pages/devshop/api/approve');
const call = (body: unknown) =>
  (POST as any)({ request: new Request('https://www.viratmohan.com/devshop/api/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });

describe('devshop approve route', () => {
  beforeEach(() => {
    sendEmail.mockClear();
    row = { id: 'sub-1', email: 'client@example.com', company: 'Acme', status: 'demo_ready', artefact_html: '<p>demo</p>', feedback_round: 0, solution_notes: null };
  });

  it('sends exactly once to the submission email, then refuses a second approval', async () => {
    const first = await call({ id: 'sub-1' });
    expect(first.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail.mock.calls[0] as any)[0].to).toBe('client@example.com');

    const second = await call({ id: 'sub-1' });
    expect(second.status).toBe(409);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('ignores any overrideEmail in the request', async () => {
    const res = await call({ id: 'sub-1', overrideEmail: 'attacker@example.com' });
    expect(res.status).toBe(200);
    expect((sendEmail.mock.calls[0] as any)[0].to).toBe('client@example.com');
    expect(JSON.stringify(sendEmail.mock.calls)).not.toContain('attacker@example.com');
  });

  it('still refuses rows that are not demo_ready', async () => {
    row.status = 'received';
    expect((await call({ id: 'sub-1' })).status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
