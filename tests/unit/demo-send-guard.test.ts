import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSingleEmailAddress, autoSendDecision, AUTO_SEND_PER_ADDRESS_24H, AUTO_SEND_GLOBAL_24H } from '../../src/lib/demo-send-guard';
import { buildMime } from '../../src/lib/mail/gmail';

describe('intake email address', () => {
  it('accepts one plain address', () => {
    expect(isSingleEmailAddress('founder@example.com')).toBe(true);
    expect(isSingleEmailAddress('a.b+tag@mail.example.co.in')).toBe(true);
  });
  it('rejects multiple recipients, header injection and display names', () => {
    for (const bad of ['a@x.com,b@y.com', 'a@x.com;b@y.com', 'a@x.com b@y.com', 'a@x.com\r\nBcc: c@d.com', 'a@x.com\nBcc: c@d.com', 'Name <a@x.com>', 'a@x', '@x.com', '', `${'a'.repeat(250)}@x.com`]) {
      expect(isSingleEmailAddress(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('automatic first-demo send caps', () => {
  it('sends within both caps', () => {
    expect(autoSendDecision({ submissionsToAddress24h: AUTO_SEND_PER_ADDRESS_24H, autoSent24h: AUTO_SEND_GLOBAL_24H - 1 })).toEqual({ send: true });
  });
  it('holds past the per-address cap', () => {
    expect(autoSendDecision({ submissionsToAddress24h: AUTO_SEND_PER_ADDRESS_24H + 1, autoSent24h: 0 }).send).toBe(false);
  });
  it('holds at the global cap', () => {
    expect(autoSendDecision({ submissionsToAddress24h: 1, autoSent24h: AUTO_SEND_GLOBAL_24H }).send).toBe(false);
  });
});

describe('buildMime header safety', () => {
  it('refuses a line break in any header value', () => {
    const base = { from: 'Virat <v@x.com>', to: 'a@x.com', subject: 's', text: 't' };
    expect(() => buildMime({ ...base, to: 'a@x.com\r\nBcc: c@d.com' })).toThrow(/line break/);
    expect(() => buildMime({ ...base, replyTo: 'r@x.com\nBcc: c@d.com' })).toThrow(/line break/);
    expect(buildMime(base)).toContain('To: a@x.com');
  });
});

// Intake route: a bad address never creates a submission; a held demo is saved but not emailed.
const sendEmail = vi.fn(async () => 'gmail');
const sendDemoDoneEmail = vi.fn(async () => ({ demoUrl: 'u', sentTo: 'x' }));
const db = {
  findRecentDuplicateSubmission: vi.fn(async () => null),
  insertSubmission: vi.fn(async () => {}),
  listActiveFrameworks: vi.fn(async () => []),
  listActiveAiAgents: vi.fn(async () => []),
  listPastFrameworkUsageByIndustry: vi.fn(async () => []),
  recordGeneration: vi.fn(async () => {}),
  markDemoReady: vi.fn(async () => {}),
  logTransition: vi.fn(async () => {}),
  getById: vi.fn(async () => ({ id: 'x', email: 'founder@example.com' })),
  markSent: vi.fn(async () => {}),
  markFailed: vi.fn(async () => {}),
  countSubmissionsToEmailSince: vi.fn(async () => 1),
  countAutoSentSince: vi.fn(async () => 0),
};
vi.mock('@vercel/functions', () => ({ waitUntil: () => {} }));
vi.mock('../../src/lib/email', () => ({ sendEmail }));
vi.mock('../../src/lib/demo-email', () => ({ sendDemoDoneEmail }));
vi.mock('../../src/lib/env', () => ({ getEnv: () => ({ ADMIN_NOTIFY_EMAIL: 'admin@x.com', ANTHROPIC_API_KEY: 'k' }) }));
vi.mock('../../src/lib/db', () => ({ getDb: () => db }));
vi.mock('../../src/lib/llm', () => ({
  classifyAndBuild: vi.fn(async () => ({
    generationMeta: { model: 'm', promptVersion: 'p', status: 'success', attempts: 1, durationMs: 1, errorMessage: null },
    artefactValidations: [], problemBreakdown: {}, frameworkSelections: [], solutionMechanisms: [], validations: [], artefactPlan: {}, clarifyingQuestions: [], levers: [], artefactHtml: '<p>demo</p>',
  })),
  fetchWebsiteSnippet: vi.fn(async () => null),
  resolveFrameworkSelections: () => [],
  resolveAgentSequence: () => [],
}));
const { POST } = await import('../../src/pages/devshop/api/intake');
const call = (email: string) =>
  (POST as any)({ request: new Request('https://www.viratmohan.com/devshop/api/intake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, problem: 'Our customer enquiries go unanswered for days across channels.' }) }) });

describe('intake route', () => {
  beforeEach(() => { vi.clearAllMocks(); db.countSubmissionsToEmailSince.mockResolvedValue(1); db.countAutoSentSince.mockResolvedValue(0); });

  it('rejects an injected or multi-recipient address before anything is saved or sent', async () => {
    for (const bad of ['a@x.com,b@y.com', 'a@x.com\r\nBcc: c@d.com']) {
      expect((await call(bad)).status).toBe(400);
    }
    expect(db.insertSubmission).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('auto-sends within the caps and does not mark it approved', async () => {
    expect((await call('founder@example.com')).status).toBe(201);
    expect(sendDemoDoneEmail).toHaveBeenCalledTimes(1);
    expect(db.markSent).toHaveBeenCalledWith(expect.any(String), { approved: false });
  });

  it('past a cap, saves the demo but holds the email for admin approval', async () => {
    db.countSubmissionsToEmailSince.mockResolvedValue(AUTO_SEND_PER_ADDRESS_24H + 1);
    expect((await call('founder@example.com')).status).toBe(201);
    expect(db.markDemoReady).toHaveBeenCalled();
    expect(sendDemoDoneEmail).not.toHaveBeenCalled();
    expect(db.markSent).not.toHaveBeenCalled();
    expect(sendEmail.mock.calls.some((c: any) => /held for your approval/.test(c[0].subject))).toBe(true);
  });
});
