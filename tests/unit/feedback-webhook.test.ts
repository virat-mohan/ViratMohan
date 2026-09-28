import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stage 3A Fix A: the feedback webhook must fail closed when RESEND_WEBHOOK_SECRET
// is unset, and only reach the paid revision path on a verified request.
const runRevision = vi.fn(async () => ({ success: true }));
const sendEmail = vi.fn(async () => 'sent');
const getById = vi.fn(async () => ({ id: 'sub-1', status: 'sent', feedback_round: 0, company: 'Acme', email: 'c@example.com' }));
const verify = vi.fn(); // throws for a bad signature

let secret = 'whsec_test';
vi.mock('../../src/lib/env', () => ({ getEnv: () => ({ RESEND_WEBHOOK_SECRET: secret, ADMIN_NOTIFY_EMAIL: 'admin@x.com' }) }));
vi.mock('../../src/lib/db', () => ({ getDb: () => ({ getById }) }));
vi.mock('../../src/lib/email', () => ({ sendEmail }));
vi.mock('../../src/lib/http', () => ({ getOrigin: () => 'https://www.viratmohan.com' }));
vi.mock('../../src/lib/revision', () => ({ runRevision }));
vi.mock('svix', () => ({ Webhook: class { verify(...a: unknown[]) { return verify(...a); } } }));

const { POST } = await import('../../src/pages/devshop/api/feedback-webhook');
const UUID = '11111111-1111-1111-1111-111111111111';
const call = (body: unknown) =>
  (POST as any)({ request: new Request('https://www.viratmohan.com/devshop/api/feedback-webhook', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) });
const goodPayload = { data: { to: `feedback+${UUID}@mail.example.com`, text: 'please make the logo bigger' } };

describe('feedback webhook fail-closed', () => {
  beforeEach(() => { vi.clearAllMocks(); secret = 'whsec_test'; verify.mockReturnValue(undefined); });

  it('secret unset → 503 and processes nothing', async () => {
    secret = '';
    const res = await call(goodPayload);
    expect(res.status).toBe(503);
    expect(getById).not.toHaveBeenCalled();
    expect(runRevision).not.toHaveBeenCalled();
  });

  it('bad signature → 401 and processes nothing', async () => {
    verify.mockImplementation(() => { throw new Error('bad sig'); });
    const res = await call(goodPayload);
    expect(res.status).toBe(401);
    expect(runRevision).not.toHaveBeenCalled();
  });

  it('valid signature → normal processing (runs the revision)', async () => {
    const res = await call(goodPayload);
    expect(res.status).toBe(200);
    expect(verify).toHaveBeenCalledOnce();
    expect(runRevision).toHaveBeenCalledOnce();
  });
});
