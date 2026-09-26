// The Employee Support Agent's morning report: everything each team member
// did in the last 24 hours, what is stuck, late or due today, and their own
// words from the tracker. Sent to Virat at 09:30 IST by /api/cron/team-digest.
// Pure functions here so the report is testable without a database.
import { escapeHtml } from './retail-os-http';
import { renderRetailOsEmail } from './retail-os-email';
import type { OpsLog, OpsTask, TeamMember } from './retail-os-ops';

export type MemberDigest = {
  member: TeamMember;
  done: OpsTask[]; // marked done in the window
  started: OpsTask[]; // moved to in progress in the window
  blocked: OpsTask[];
  overdue: OpsTask[];
  dueToday: OpsTask[];
  log: OpsLog[]; // daily updates, questions and notes in the window
  dueByToday: number; // target: open-or-done tasks due on or before today
  doneOfDue: number; // actual: of those, how many are done
  total: number;
  totalDone: number;
};

const open = (t: OpsTask) => t.status !== 'done' && t.status !== 'na';

export function buildMemberDigest(member: TeamMember, tasks: OpsTask[], log: OpsLog[], since: string, today: string): MemberDigest {
  const inWindow = (ts: string) => ts >= since;
  const counted = tasks.filter((t) => t.status !== 'na');
  const due = counted.filter((t) => t.due_on && t.due_on <= today);
  return {
    member,
    done: tasks.filter((t) => t.status === 'done' && inWindow(t.updated_at)),
    started: tasks.filter((t) => t.status === 'doing' && inWindow(t.updated_at)),
    blocked: tasks.filter((t) => t.status === 'blocked'),
    overdue: tasks.filter((t) => open(t) && t.due_on && t.due_on < today),
    dueToday: tasks.filter((t) => open(t) && t.due_on === today),
    log: log.filter((l) => inWindow(l.created_at)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    dueByToday: due.length,
    doneOfDue: due.filter((t) => t.status === 'done').length,
    total: counted.length,
    totalDone: counted.filter((t) => t.status === 'done').length,
  };
}

const FONT = 'Arial, Helvetica, sans-serif';
const h2 = (s: string) => `<h2 style="margin:22px 0 8px;font-family:${FONT};font-size:16px;color:#1A1410;">${escapeHtml(s)}</h2>`;
const h3 = (s: string) => `<p style="margin:14px 0 4px;font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#D9714B;">${escapeHtml(s)}</p>`;
const p = (s: string) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:#4A4038;">${escapeHtml(s)}</p>`;
const list = (items: string[]) =>
  `<ul style="margin:0 0 8px;padding-left:18px;">${items.map((i) => `<li style="margin:0 0 5px;font-family:${FONT};font-size:14px;line-height:1.45;color:#4A4038;">${escapeHtml(i)}</li>`).join('')}</ul>`;
const taskLine = (t: OpsTask) => `${t.brand_name}: ${t.task}${t.due_on ? ` (due ${t.due_on})` : ''}${t.note && t.status === 'blocked' ? ` — ${t.note}` : ''}`;
const time = (ts: string) => new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const LOG_LABEL: Record<string, string> = { daily: 'Update', query: 'Question', note: 'Note', status: 'Status', answer: 'Assistant', escalated: 'Sent to Virat' };

export function renderMemberSection(d: MemberDigest, trackerUrl: string): string {
  const parts = [h2(`${d.member.name} · ${d.member.role}`)];
  parts.push(p(`Target: every task due by today done (${d.dueByToday}). Actual: ${d.doneOfDue} of ${d.dueByToday}. Overall ${d.totalDone} of ${d.total} done.`));
  const section = (title: string, tasks: OpsTask[]) => { if (tasks.length) parts.push(h3(`${title} (${tasks.length})`), list(tasks.slice(0, 15).map(taskLine)) + (tasks.length > 15 ? p(`…and ${tasks.length - 15} more on the tracker.`) : '')); };
  section('Done', d.done);
  section('Started', d.started);
  section('Blocked', d.blocked);
  section('Overdue', d.overdue);
  section('Due today', d.dueToday);
  if (d.log.length) parts.push(h3('In their words'), list(d.log.map((l) => `${LOG_LABEL[l.kind] ?? l.kind}, ${time(l.created_at)}: ${l.body}`)));
  if (!d.done.length && !d.started.length && !d.log.length) parts.push(p('No task moved and no update posted since the last report.'));
  parts.push(`<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;"><a href="${escapeHtml(trackerUrl)}" style="color:#1A1410;">Open ${escapeHtml(d.member.name)}'s tracker</a></p>`);
  return parts.join('');
}

export function renderTeamDigest(digests: MemberDigest[], opts: { today: string; origin: string }): { subject: string; html: string } {
  const done = digests.reduce((n, d) => n + d.done.length, 0);
  const blocked = digests.reduce((n, d) => n + d.blocked.length, 0);
  const overdue = digests.reduce((n, d) => n + d.overdue.length, 0);
  const summary = `${done} done since yesterday, ${blocked} blocked, ${overdue} overdue.`;
  const body = digests.length
    ? digests.map((d) => renderMemberSection(d, `${opts.origin}/retail-os/ops/${d.member.token}`)).join('')
    : p('No active team members.');
  return {
    subject: `Team report, ${opts.today}: ${summary}`,
    html: renderRetailOsEmail({
      preheader: summary,
      eyebrow: 'Team · daily at 9:30',
      heading: 'Team report',
      lines: [summary, 'Blocked and overdue items need a decision from me or a nudge. Everything else is moving.'],
      bodyHtml: body,
      cta: { label: 'Open the console', url: `${opts.origin}/retail-os/admin/console` },
    }),
  };
}
