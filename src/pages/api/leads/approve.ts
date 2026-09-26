export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { serviceDb } from '../../../lib/ledger';
import { escapeHtml } from '../../../lib/retail-os-http';
import { calmPage } from '../../../lib/calm-page';
import { liveGmail } from '../../../lib/mail/send';
import { SupabaseLeadStore } from '../../../lib/lead-mail/store';
import { approve, peekApproval } from '../../../lib/lead-mail/run';
import { gmailThreadUrl } from '../../../lib/lead-mail/notice';
import { onLeadMessageSent } from '../../../lib/lead-approval';

// Approve & send. GET only shows the draft (mail scanners open links; they must
// never send anything). The button POSTs, which uses the signed token once.
const REASONS: Record<string, string> = {
  expired: 'This link has expired. The draft is still in Gmail, so you can send it from there.',
  bad_signature: 'This link is not valid.', malformed: 'This link is not valid.', not_found: 'I could not find that draft.',
  already_used: 'This reply has already been sent.', already_handled: 'This reply has already been sent or handled.',
};

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv();
  const t = url.searchParams.get('t') ?? '';
  const peek = await peekApproval(new SupabaseLeadStore(serviceDb(env)), t, env.LEAD_APPROVAL_SECRET, new Date());
  if (!peek.ok) return calmPage({ title: 'Approve reply', heading: 'Nothing to send', body: `<p>${escapeHtml(REASONS[peek.reason] ?? 'This link is not valid.')}</p>`, status: 400 });
  const m = peek.msg;
  if (m.status !== 'awaiting_approval') return calmPage({ title: 'Approve reply', heading: 'Already sent', body: `<p>${REASONS.already_handled}</p>` });
  return calmPage({
    title: 'Approve reply', eyebrow: 'Reply ready', heading: m.subject ?? 'Your reply',
    body: `<div class="quote">${escapeHtml(m.body)}</div>
<form method="post" class="row"><input type="hidden" name="t" value="${escapeHtml(t)}">
<button class="btn" type="submit">Approve &amp; send</button>
${m.gmail_thread_id ? `<a class="quiet" href="${gmailThreadUrl(m.gmail_thread_id)}">Edit in Gmail</a>` : ''}</form>
<p class="small">If you edited the draft in Gmail, your edited version is the one that goes.</p>`,
  });
};

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const form = await request.formData().catch(() => null);
  const t = String(form?.get('t') ?? '');
  const gmail = await liveGmail(env);
  if (!gmail) return calmPage({ title: 'Approve reply', heading: 'Gmail is not connected', body: '<p>Connect Gmail first, then use the link again.</p>', status: 503 });
  const sb = serviceDb(env);
  const r = await approve({ store: new SupabaseLeadStore(sb), gmail, secret: env.LEAD_APPROVAL_SECRET, now: new Date(), mailbox: env.GMAIL_ADDRESS, onSent: (m) => onLeadMessageSent(sb as any, m) }, t);
  if (!r.ok) return calmPage({ title: 'Approve reply', heading: r.status === 502 ? 'Gmail did not send it' : 'Nothing to send', body: `<p>${escapeHtml(REASONS[r.reason] ?? 'Gmail returned an error. The link still works, so try again in a minute.')}</p>`, status: r.status });
  return calmPage({ title: 'Sent', eyebrow: 'Sent', heading: 'On its way', body: `<p>Sent from your Gmail. Next step: ${escapeHtml(r.nextStep)}.</p><p><a class="quiet" href="/retail-os/admin/leads">See all leads</a></p>` });
};
