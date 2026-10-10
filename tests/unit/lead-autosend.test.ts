import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mayAutoSendPurpose, AUTO_SEND_PURPOSES } from '../../src/lib/lead-journey';

// Stage 5A: routine journey emails may auto-send only under a deterministic allowlist.
// Authority is the purpose list, never an LLM or message content.

const deliver = vi.fn(async () => 'gmail');
const notifier = vi.fn(async () => {});
vi.mock('../../src/lib/mail/send', () => ({ deliver, liveMailDeps: async () => ({}) }));
vi.mock('../../src/lib/mail/links', () => ({ signatureText: () => 'Virat' }));
vi.mock('../../src/lib/lead-mail/token', () => ({ signToken: () => ({ token: 'tok', payload: { n: 'nonce', exp: Date.now() + 1000 } }) }));
vi.mock('../../src/lib/lead-mail/live', () => ({ viratNotifier: () => notifier }));

const { submitForApproval } = await import('../../src/lib/lead-approve');

// Minimal chainable fake Supabase. `recentSent` seeds the duplicate-check query.
function fakeSb(opts: { recentSent?: boolean; recentPurpose?: string } = {}) {
  const inserted: any[] = [];
  const updates: any[] = [];
  const leads = new Map([['lead-1', { id: 'lead-1', stage: 'new' }]]);
  const b = (table: string) => {
    const st: any = { table, _op: null, _payload: null, _purpose: null };
    st.insert = (p: any) => { st._op = 'insert'; st._payload = p; if (table === 'lead_messages') inserted.push(p); return st; };
    st.update = (p: any) => { st._op = 'update'; st._payload = p; if (table === 'lead_messages') updates.push(p); if (table === 'leads') { const l = leads.get('lead-1'); if (l) Object.assign(l, p); } return st; };
    st.select = () => st;
    st.eq = function() { if (arguments[0] === 'purpose' || (table === 'lead_messages' && arguments[0] === 'status')) return st; return this; };
    st.gte = () => st;
    st.limit = () => Promise.resolve({ data: table === 'lead_messages' && opts.recentSent ? [{ id: 'old', meta: { purpose: opts.recentPurpose ?? 'nda_reminder' } }] : [], error: null });
    st.single = () => Promise.resolve({ data: { id: 'msg-1' }, error: null });
    st.maybeSingle = () => Promise.resolve({ data: leads.get('lead-1'), error: null });
    return st;
  };
  return { from: b, _inserted: inserted, _updates: updates, _leads: leads };
}

const baseEnv: any = { LEAD_JOURNEY_AUTOSEND: 'on', LEAD_APPROVAL_SECRET: 'sek', GMAIL_ADDRESS: 'v@x.com' };
const draft = (purpose: string, toEmail: string | null = 'founder@example.com') => ({
  leadId: 'lead-1', subject: 'S', body: 'B', purpose, sendAfter: null, leadName: 'Acme', toEmail,
  context: ['ctx', 'ctx2'] as [string, string],
} as any); // test double; purpose is intentionally a plain string to exercise unknown-purpose cases

describe('mayAutoSendPurpose (deterministic allowlist)', () => {
  it('allows only the four routine purposes', () => {
    for (const p of AUTO_SEND_PURPOSES) expect(mayAutoSendPurpose(p)).toBe(true);
    for (const p of ['plan_cover', 'reply', 'published_terms', 'terms', 'payout', '', null, undefined, 'NDA_REQUEST'])
      expect(mayAutoSendPurpose(p as any)).toBe(false);
  });
});

describe('submitForApproval auto-send gating', () => {
  beforeEach(() => { deliver.mockClear(); notifier.mockClear(); });

  it('A. allowlisted routine message auto-sends when the flag is on', async () => {
    const sb = fakeSb();
    const r = await submitForApproval(baseEnv, sb as any, draft('nda_request'));
    expect(r.sent).toBe(true);
    expect(deliver).toHaveBeenCalledOnce();
    expect(notifier).not.toHaveBeenCalled(); // no approval ping needed
  });

  it('B. human-only message (plan_cover) never auto-sends — parks for approval', async () => {
    const sb = fakeSb();
    const r = await submitForApproval(baseEnv, sb as any, draft('plan_cover'));
    expect(r.sent).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    expect(notifier).toHaveBeenCalledOnce(); // Virat gets the approval link
  });

  it('C. unknown purpose fails closed — parks for approval', async () => {
    const sb = fakeSb();
    const r = await submitForApproval(baseEnv, sb as any, draft('negotiate_discount'));
    expect(r.sent).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    expect(notifier).toHaveBeenCalledOnce();
  });

  it('D. missing recipient does not send — parks', async () => {
    const sb = fakeSb();
    const r = await submitForApproval(baseEnv, sb as any, draft('nda_request', null));
    expect(r.sent).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('E. duplicate recent send is not sent again — parks instead', async () => {
    const sb = fakeSb({ recentSent: true });
    const r = await submitForApproval(baseEnv, sb as any, draft('nda_reminder'));
    expect(r.sent).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    expect(notifier).toHaveBeenCalledOnce();
  });

  it('F. auto-send writes an audit record with the authorising rule and recipient', async () => {
    const sb = fakeSb();
    await submitForApproval(baseEnv, sb as any, draft('access_request'));
    const meta = sb._updates.find((u) => u.meta)?.meta;
    expect(meta).toMatchObject({ auto: true, rule: 'ALLOWLIST_ACCESS_REQUEST', recipient: 'founder@example.com', template: 'access_request' });
    expect(sb._leads.get('lead-1')?.stage).toBe('access_requested'); // stage advanced deterministically
  });

  it('G. with the flag OFF, even a routine message parks for approval', async () => {
    const sb = fakeSb();
    const r = await submitForApproval({ ...baseEnv, LEAD_JOURNEY_AUTOSEND: 'off' }, sb as any, draft('nda_request'));
    expect(r.sent).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
    expect(notifier).toHaveBeenCalledOnce();
    expect(r.approveUrl).toContain('/api/leads/approve?t=');
  });

  it('H. delivery failure fails safe — parks for approval, does not throw', async () => {
    deliver.mockRejectedValueOnce(new Error('smtp down'));
    const sb = fakeSb();
    const r = await submitForApproval(baseEnv, sb as any, draft('nda_request'));
    expect(r.sent).toBe(false);
    expect(notifier).toHaveBeenCalledOnce();
  });
});
