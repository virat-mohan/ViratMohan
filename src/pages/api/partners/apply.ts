export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { serviceDb } from '../../../lib/ledger';
import { mailConfigured } from '../../../lib/mail/send';
import { endpointLimit } from '../../../lib/rate-limit';
import { SupabaseLeadStore } from '../../../lib/lead-mail/store';
import { viratNotifier } from '../../../lib/lead-mail/live';

// Rate limit: 1 application per IP per minute, 5 per hour per IP.
// Prevents form spam and abuse.
const limit = endpointLimit({ rules: [{ limit: 1, windowMs: 60_000 }, { limit: 5, windowMs: 3_600_000 }], body: { error: 'Please wait a moment before applying again.' } });

// Max payload size: 10 KB (brand name + contact + motivation, not files)
const MAX_BODY_SIZE = 10 * 1024;

export interface ApplicationInput {
  brand_name?: string;
  contact_name?: string;
  contact_email?: string;
  source?: string;
  motivation?: string;
}

// Application endpoint for new partners/brands.
// Rate limited per IP. Input validated and size-capped.
export const POST: APIRoute = async ({ request }) => {
  const limited = limit(request);
  if (limited) return limited;

  // Check Content-Length early
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_SIZE) {
    return json({ error: 'Request too large' }, 413);
  }

  const env = getEnv();
  let body: ApplicationInput;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Validate required fields
  const brandName = (body.brand_name || '').trim();
  const contactName = (body.contact_name || '').trim();
  const contactEmail = (body.contact_email || '').trim();
  const motivation = (body.motivation || '').trim();

  if (!brandName || !contactEmail || !contactName) {
    return json({ error: 'brand_name, contact_name, and contact_email are required' }, 400);
  }

  // Email format validation
  if (!isValidEmail(contactEmail)) {
    return json({ error: 'Invalid email address' }, 400);
  }

  // Prevent XSS: ensure strings don't exceed reasonable length
  if (brandName.length > 200 || contactName.length > 100 || motivation.length > 2000) {
    return json({ error: 'Input too long' }, 400);
  }

  try {
    const sb = serviceDb(env);
    const store = new SupabaseLeadStore(sb);

    // Create a lead record
    const lead = await store.createLead({
      brand_name: brandName,
      contact_name: contactName || null,
      contact_email: contactEmail,
      source: body.source || 'api',
      stage: 'new',
    });

    // Log the application as an internal note
    await store.insertMessage({
      lead_id: lead.id,
      direction: 'internal',
      channel: 'note',
      status: 'logged',
      subject: 'Application submitted',
      body: motivation || '(no additional information)',
      gmail_message_id: null,
      gmail_thread_id: null,
    });

    // Notify Virat if email is configured
    if (mailConfigured(env)) {
      try {
        const notifier = viratNotifier(env, new Date());
        await notifier({
          kind: 'approval',
          leadName: brandName,
          subject: `New partner application from ${brandName}`,
          context: [contactName, contactEmail],
          draft: motivation || '(no message)',
          gmailUrl: 'https://mail.google.com/mail/u/0/#all',
        });
      } catch (notifyErr) {
        console.error('Failed to notify Virat of application', notifyErr);
      }
    }

    return json({ ok: true, leadId: lead.id }, 201);
  } catch (err) {
    console.error('partner application failed', err);
    return json({ error: 'Unable to process application. Please try again in a moment.' }, 500);
  }
};

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
