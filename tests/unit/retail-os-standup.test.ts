import { describe, it, expect, vi } from 'vitest';
import { computeStandup, nextAction, verifyBrandEnvironment, verificationAuditBody, type StandupTask, type EnvCheck } from '../../src/lib/retail-os-standup';

const t = (stage: number, status: string, owner = 'team', extra: Partial<StandupTask> = {}): StandupTask =>
  ({ stage, status, owner, task: `s${stage}-${status}`, priority: 2, sort: stage, ...extra });

// A full checklist: infra (0,1), config (2-7), admin (8), handover (9).
const full = (over: Record<number, string> = {}) =>
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => t(s, over[s] ?? 'done', s === 9 || s === 8 ? 'founder' : 'team'));

describe('computeStandup lifecycle (deterministic)', () => {
  it('A. no tasks → NOT_STARTED', () => {
    expect(computeStandup([], false).status).toBe('NOT_STARTED');
  });

  it('B. infra stage open → PROVISIONING', () => {
    expect(computeStandup(full({ 1: 'todo', 2: 'todo' }), false).status).toBe('PROVISIONING');
  });

  it('C. a config/integration stage open → CONFIGURATION_REQUIRED', () => {
    expect(computeStandup(full({ 5: 'todo' }), false).status).toBe('CONFIGURATION_REQUIRED');
  });

  it('D. only handover open, env not verified → VERIFICATION_REQUIRED', () => {
    expect(computeStandup(full({ 9: 'todo' }), false, null).status).toBe('VERIFICATION_REQUIRED');
  });

  it('E. only handover open, env verified → READY_FOR_GO_LIVE', () => {
    expect(computeStandup(full({ 9: 'todo' }), false, true).status).toBe('READY_FOR_GO_LIVE');
  });

  it('F. all done but brand not marked live → READY_FOR_GO_LIVE (human go-live), not LIVE', () => {
    const s = computeStandup(full(), false, true);
    expect(s.status).toBe('READY_FOR_GO_LIVE'); // never auto-flips to LIVE
  });

  it('G. all done and brand registry live → LIVE', () => {
    expect(computeStandup(full(), true, true).status).toBe('LIVE');
  });

  it('H. any blocked task → BLOCKED, with blocker + owner captured', () => {
    const s = computeStandup(full({ 3: 'blocked' }).map((x) => x.stage === 3 ? { ...x, note: 'PAYMENT_PENDING', owner: 'founder' } : x), false);
    expect(s.status).toBe('BLOCKED');
    expect(s.blocker).toMatchObject({ owner: 'founder', reason: 'PAYMENT_PENDING' });
  });

  it('I. nextAction returns the highest-priority open task with its owner (human steps included)', () => {
    const tasks = [t(2, 'todo', 'team', { priority: 2 }), t(8, 'todo', 'founder', { priority: 1 })];
    expect(nextAction(tasks)).toEqual({ task: 's8-todo', owner: 'founder' });
  });

  it('J. a human-owned open step is never counted as done by the rollup', () => {
    // founder handover step still todo → status is not LIVE even if everything else is done
    const s = computeStandup(full({ 9: 'todo' }), true, true);
    expect(s.status).not.toBe('LIVE');
    expect(s.done).toBeLessThan(s.total);
  });
});

describe('verifyBrandEnvironment (deterministic, fail-closed)', () => {
  const brand = { key: 'acme', name: 'Acme', supabaseUrl: 'https://x.supabase.co', serviceKey: 'SECRET_SERVICE_KEY' };
  const okCheck: EnvCheck = { key: 'acme', name: 'Acme', ok: true, message: 'Connected', ms: 12, urlRef: 'x' };

  it('unconfigured brand fails closed (not "ok")', async () => {
    const r = await verifyBrandEnvironment('ghost', { listBrands: () => [brand], check: async () => okCheck });
    expect(r).toEqual({ found: false, reason: 'not_configured' });
  });

  it('configured brand runs the deterministic check', async () => {
    const check = vi.fn(async () => okCheck);
    const r = await verifyBrandEnvironment('acme', { listBrands: () => [brand], check });
    expect(check).toHaveBeenCalledOnce();
    expect(r).toEqual({ found: true, check: okCheck });
  });

  it('audit body records result + project ref but never the service key', async () => {
    const r = await verifyBrandEnvironment('acme', { listBrands: () => [brand], check: async () => okCheck });
    const body = verificationAuditBody(r, 'acme');
    expect(body).toContain('PASS');
    expect(body).toContain('project x');
    expect(body).not.toContain('SECRET_SERVICE_KEY');
  });

  it('a failing check is recorded as FAIL with the message, still no key', async () => {
    const fail: EnvCheck = { key: 'acme', name: 'Acme', ok: false, message: 'Supabase rejected the key', ms: 30, urlRef: 'x' };
    const body = verificationAuditBody({ found: true, check: fail }, 'acme');
    expect(body).toContain('FAIL');
    expect(body).not.toContain('SECRET_SERVICE_KEY');
  });
});

describe("'pending' tasks are open work (the ops board really holds them)", () => {
  it('stage 1 tasks that are only pending keep the stand-up in PROVISIONING, not READY_FOR_GO_LIVE', () => {
    // Fresh For Paws had 8 stage-1 tasks with status 'pending'. Before the fix they were neither open nor done.
    const tasks = [t(0, 'done'), t(1, 'pending'), t(1, 'pending'), t(9, 'todo', 'founder')];
    const s = computeStandup(tasks, false);
    expect(s.status).toBe('PROVISIONING');
    expect(s.open).toBe(3);
    expect(nextAction(tasks)?.task).toBe('s1-pending');
  });

  it('a pending configuration task keeps it CONFIGURATION_REQUIRED even when the environment is verified', () => {
    expect(computeStandup([t(0, 'done'), t(5, 'pending'), t(9, 'todo', 'founder')], false, true).status).toBe('CONFIGURATION_REQUIRED');
  });
});
