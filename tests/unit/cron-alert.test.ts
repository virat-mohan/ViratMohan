import { describe, it, expect, vi } from 'vitest';
import { alertCronFailure, sanitizeDetail, withCronAlert, type AlertDeps, type AlertRow } from '../../src/lib/cron-alert';

// Monitoring only: one alert per job per IST day, nothing personal in it, and the job's own
// response never changes.
const OPEN = new Date('2026-09-28T06:00:00Z'); // Monday 11:30 IST
const CLOSED = new Date('2026-09-28T17:00:00Z'); // Monday 22:30 IST

function fakeDeps(now: Date) {
  const rows = new Map<string, AlertRow>();
  const send = vi.fn(async () => {});
  const deps: AlertDeps = {
    now, to: 'admin@example.com', send,
    claim: async (r) => (rows.has(r.key) ? false : (rows.set(r.key, r), true)),
    markFailed: async () => {},
  };
  return { deps, rows, send };
}

describe('alertCronFailure', () => {
  it('sends one alert per job per day inside open hours', async () => {
    const { deps, send, rows } = fakeDeps(OPEN);
    expect(await alertCronFailure('lead-mail', 'boom', deps)).toBe('sent');
    expect(await alertCronFailure('lead-mail', 'boom again', deps)).toBe('duplicate');
    expect(send).toHaveBeenCalledTimes(1);
    expect([...rows.keys()]).toEqual(['cron-fail:lead-mail:2026-09-28']);
  });

  it('a different job gets its own alert', async () => {
    const { deps, send } = fakeDeps(OPEN);
    await alertCronFailure('lead-mail', 'x', deps);
    await alertCronFailure('outbox', 'x', deps);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('outside open hours it queues instead of sending, still once', async () => {
    const { deps, send, rows } = fakeDeps(CLOSED);
    expect(await alertCronFailure('settle', 'x', deps)).toBe('queued');
    expect(await alertCronFailure('settle', 'x', deps)).toBe('duplicate');
    expect(send).not.toHaveBeenCalled();
    const row = [...rows.values()][0];
    expect(row.status).toBe('queued');
    expect(row.sendAfter.getTime()).toBeGreaterThan(CLOSED.getTime());
  });

  it('never throws, and reports a failed send', async () => {
    const { deps } = fakeDeps(OPEN);
    deps.send = async () => { throw new Error('smtp down'); };
    expect(await alertCronFailure('reports', 'x', deps)).toBe('failed');
  });

  it('does nothing without a recipient', async () => {
    const { deps, send } = fakeDeps(OPEN);
    deps.to = '';
    expect(await alertCronFailure('reports', 'x', deps)).toBe('no-recipient');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('sanitizeDetail', () => {
  it('removes emails, phone numbers and tokens, and stays short', () => {
    const s = sanitizeDetail('insert failed for jane.doe@example.com phone +91 98765 43210 key eyJhbGciOiJIUzI1NiJ9abcdefghijk ' + 'x '.repeat(400));
    expect(s).not.toContain('jane.doe');
    expect(s).not.toContain('98765');
    expect(s).not.toContain('eyJhbGci');
    expect(s).toContain('[email]');
    expect(s).toContain('[number]');
    expect(s.length).toBeLessThanOrEqual(300);
  });
});

describe('withCronAlert', () => {
  const ctx = {} as never;
  const ok = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

  it('success: same response, no alert', async () => {
    const alert = vi.fn(async () => {});
    const res = await withCronAlert('team-digest', ok({ sent: true }), { alert })(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
    expect(alert).not.toHaveBeenCalled();
  });

  it('a thrown error becomes a 500 and one alert (lead-access had no error handling)', async () => {
    const alert = vi.fn(async () => {});
    const res = await withCronAlert('lead-access', async () => { throw new Error('db timeout'); }, { alert })(ctx);
    expect(res.status).toBe(500);
    expect(alert).toHaveBeenCalledWith('lead-access', 'db timeout');
  });

  it('a 5xx response is returned unchanged and alerted', async () => {
    const alert = vi.fn(async () => {});
    const res = await withCronAlert('outbox', ok({ error: 'Outbox flush failed' }, 500), { alert })(ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Outbox flush failed' });
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('401 (bad cron secret) is not alerted', async () => {
    const alert = vi.fn(async () => {});
    await withCronAlert('settle', ok({ error: 'Unauthorized' }, 401), { alert })(ctx);
    expect(alert).not.toHaveBeenCalled();
  });

  it('a failure reported inside a 200 body is alerted, response unchanged', async () => {
    const alert = vi.fn(async () => {});
    const failureIn = (b: unknown) => ('skipped' in (b as object) ? 'skipped: Gmail not connected' : null);
    const res = await withCronAlert('lead-mail', ok({ skipped: 'Gmail not connected' }), { alert, failureIn })(ctx);
    expect(res.status).toBe(200);
    expect(alert).toHaveBeenCalledWith('lead-mail', 'skipped: Gmail not connected');
  });
});
