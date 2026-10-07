export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { serviceDb } from '../../../lib/ledger';
import { sendEmail } from '../../../lib/email';
import { getOrigin } from '../../../lib/http';
import { renderRetailOsEmail } from '../../../lib/retail-os-email';
import { mailConfigured } from '../../../lib/mail/send';
import { endpointLimit } from '../../../lib/rate-limit';
import { signToken } from '../../../lib/lead-mail/token';
import { SupabaseLeadStore } from '../../../lib/lead-mail/store';

// Rate limit: resend only 3 times per minute per email/IP, 10 per hour.
// Covers accidental double-clicks and transient failures.
const limit = endpointLimit({ rules: [{ limit: 3, windowMs: 60_000 }, { limit: 10, windowMs: 3_600_000 }], body: { error: 'Too many resend requests. Please wait a few minutes and try again.' } });

const SITE = 'https://viratmohan.com';

// Resend an approval link for a lead message.
// Returns vague response (never confirms/denies lead/message exists) to avoid leaking information.
export const POST: APIRoute = async ({ request }) => {
  const limited = limit(request);
  if (limited) return limited;

  const env = getEnv();
  let body: { leadId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const leadId = (body.leadId || '').trim();
  if (!leadId) return json({ error: 'leadId is required' }, 400);

  try {
    if (!env.LEAD_APPROVAL_SECRET) return json({ ok: true }, 200);

    const sb = serviceDb(env);
    const store = new SupabaseLeadStore(sb);

    // Find the most recent awaiting_approval message for this lead
    const messages = await store.messagesFor(leadId);
    const msg = messages.reverse().find((m) => m.status === 'awaiting_approval');

    if (msg && mailConfigured(env)) {
      const lead = (await store.leads()).find((l) => l.id === leadId);
      if (!lead?.contact_email) return json({ ok: true }, 200);

      const now = new Date();
      const { token } = signToken(msg.id, env.LEAD_APPROVAL_SECRET, now.getTime());
      const approveUrl = `${SITE}/api/leads/approve?t=${encodeURIComponent(token)}`;

      await sendEmail(
        {
          to: lead.contact_email,
          subject: msg.subject ?? 'Your approval link',
          html: renderRetailOsEmail({
            preheader: 'Your approval link to send a message.',
            heading: 'Approve & send',
            lines: [msg.body.split('\n')[0] || 'Review and approve your message.'],
            cta: { label: 'Approve & send', url: approveUrl },
            note: 'This link is valid for 24 hours.',
          }),
        },
        env
      );
    }
  } catch (err) {
    console.error('lead resend-link failed', err);
  }

  // Always return ok — never reveal lookup or send failures
  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
