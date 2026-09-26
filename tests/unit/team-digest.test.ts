import { describe, it, expect } from 'vitest';
import { buildMemberDigest, renderTeamDigest } from '../../src/lib/team-digest';
import type { OpsLog, OpsTask, TeamMember } from '../../src/lib/retail-os-ops';

const member: TeamMember = { id: 'm1', name: 'Sample', email: 's@example.com', role: 'Ops', token: 'tok', started_on: '2026-09-26', monthly_inr: null, active: true, created_at: '2026-09-26T00:00:00Z' };
const task = (id: string, status: OpsTask['status'], due_on: string | null, updated_at: string): OpsTask => ({ id, member_id: 'm1', brand_key: 'b', brand_name: 'Brand', stage: 1, stage_label: 'S', task: `Task ${id}`, owner: 'team', status, note: null, due_on, sort: 0, updated_at });
const since = '2026-09-26T04:00:00Z';
const today = '2026-09-27';

describe('team digest', () => {
  const tasks = [
    task('a', 'done', '2026-09-26', '2026-09-26T10:00:00Z'),
    task('b', 'done', '2026-09-26', '2026-09-25T10:00:00Z'),
    task('c', 'todo', '2026-09-26', '2026-09-25T10:00:00Z'),
    task('d', 'blocked', '2026-09-28', '2026-09-26T09:00:00Z'),
    task('e', 'doing', '2026-09-27', '2026-09-26T12:00:00Z'),
    task('f', 'na', '2026-09-20', '2026-09-26T12:00:00Z'),
  ];
  const log: OpsLog[] = [
    { id: 'l1', member_id: 'm1', task_id: null, kind: 'daily', body: 'Did things', created_at: '2026-09-26T13:00:00Z' },
    { id: 'l2', member_id: 'm1', task_id: null, kind: 'daily', body: 'Old', created_at: '2026-09-25T13:00:00Z' },
  ];
  const d = buildMemberDigest(member, tasks, log, since, today);

  it('counts only what moved in the window', () => {
    expect(d.done.map((t) => t.id)).toEqual(['a']);
    expect(d.started.map((t) => t.id)).toEqual(['e']);
    expect(d.log.map((l) => l.id)).toEqual(['l1']);
  });
  it('flags blocked, overdue and due today; ignores not-needed', () => {
    expect(d.blocked.map((t) => t.id)).toEqual(['d']);
    expect(d.overdue.map((t) => t.id)).toEqual(['c']);
    expect(d.dueToday.map((t) => t.id)).toEqual(['e']);
    expect([d.dueByToday, d.doneOfDue, d.total, d.totalDone]).toEqual([4, 2, 5, 2]);
  });
  it('renders target vs actual and escapes text', () => {
    const { subject, html } = renderTeamDigest([{ ...d, log: [{ ...log[0], body: '<b>x</b>' }] }], { today, origin: 'https://x.test' });
    expect(subject).toContain('1 done since yesterday, 1 blocked, 1 overdue');
    expect(html).toContain('Actual: 2 of 4');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('https://x.test/retail-os/ops/tok');
  });
});

import { handleTeamQuestion } from '../../src/lib/team-support';

describe('team questions', () => {
  const setup = (answer: () => Promise<any>) => {
    const sent: any[] = [], logs: string[] = [];
    const deps = { answer, send: async (m: any) => { sent.push(m); }, log: async (k: string) => { logs.push(k); }, viratEmail: 'v@example.com', trackerUrl: 'https://x/t', consoleUrl: 'https://x/c' };
    return { sent, logs, deps };
  };
  it('emails the answer to the member when the Brain knows', async () => {
    const { sent, logs, deps } = setup(async () => ({ answer: 'Use UPI QR first [f1].', known: true, citations: [{ id: 'f1', source: 'playbook' }] }));
    const r = await handleTeamQuestion(member, 'How do we take payments on day 1?', deps);
    expect(r.answered).toBe(true);
    expect(sent.map((m) => m.to)).toEqual(['s@example.com']);
    expect(logs).toEqual(['answer']);
  });
  it('tells the member and nudges Virat when it cannot answer, or the Brain fails', async () => {
    for (const ans of [async () => ({ answer: '', known: false, citations: [], escalate: { tool: 'request_virat', why: 'none' } }), async () => { throw new Error('down'); }]) {
      const { sent, logs, deps } = setup(ans as any);
      const r = await handleTeamQuestion(member, 'Who pays the Shiprocket wallet?', deps);
      expect(r.answered).toBe(false);
      expect(sent.map((m) => m.to)).toEqual(['s@example.com', 'v@example.com']);
      expect(sent[1].replyTo).toBe('s@example.com');
      expect(logs).toEqual(['escalated']);
    }
  });
});
