// What Virat gets when a lead writes in: two lines of context, the draft, and
// two one-tap links (Approve & send, Edit in Gmail). Or, for anything high-stakes,
// the context and a link to the thread, with no draft.
import { renderRetailOsEmail } from '../retail-os-email';
import { escapeHtml } from '../retail-os-http';

export type ApprovalNotice = {
  kind: 'approval' | 'escalation';
  leadName: string; subject: string;
  context: [string, string];
  draft?: string;
  approveUrl?: string;
  gmailUrl: string;
  reasons?: string[];
};

export const gmailThreadUrl = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`;

export function noticeSubject(n: ApprovalNotice): string {
  return n.kind === 'approval' ? `Reply ready for ${n.leadName}: ${n.subject}` : `Needs you: ${n.leadName}, ${n.subject}`;
}

export function noticeEmailHtml(n: ApprovalNotice): string {
  const quote = n.draft
    ? `<div style="margin:6px 0 18px;padding:14px 16px;border-left:3px solid #D4AF37;background:#FBF6EA;font-family:Georgia, 'Times New Roman', serif;font-size:15px;line-height:1.6;color:#1A1410;white-space:pre-wrap;">${escapeHtml(n.draft)}</div>`
    : '';
  const why = n.reasons?.length ? `<p style="margin:0 0 12px;font-family:Arial, Helvetica, sans-serif;font-size:13px;color:#7A6E62;">Why it's yours: ${escapeHtml(n.reasons.join(' '))}</p>` : '';
  return renderRetailOsEmail({
    preheader: n.context[1],
    eyebrow: n.kind === 'approval' ? 'Reply ready' : 'Needs you',
    heading: n.leadName,
    lines: [...n.context],
    bodyHtml: why + quote,
    cta: n.approveUrl ? { label: 'Approve & send', url: n.approveUrl } : undefined,
    secondary: { label: n.kind === 'approval' ? 'Edit in Gmail' : 'Open the thread in Gmail', url: n.gmailUrl },
    note: n.kind === 'approval' ? 'Nothing reaches them until you approve. Edits made in Gmail are what gets sent.' : 'I have not drafted anything. Reply from Gmail when you are ready.',
  });
}

export function noticeText(n: ApprovalNotice): string {
  return [
    n.kind === 'approval' ? `Reply ready: ${n.leadName}` : `Needs you: ${n.leadName}`,
    n.context[0], n.context[1],
    ...(n.reasons?.length ? [`Why: ${n.reasons.join(' ')}`] : []),
    ...(n.draft ? ['', 'Draft:', n.draft] : []),
    '',
    ...(n.approveUrl ? [`Approve & send: ${n.approveUrl}`] : []),
    `${n.kind === 'approval' ? 'Edit in Gmail' : 'Open in Gmail'}: ${n.gmailUrl}`,
  ].join('\n');
}
