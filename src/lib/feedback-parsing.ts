// Pure parsing/guard logic behind the inbound feedback webhook
// (src/pages/devshop/api/feedback-webhook.ts). Split out so it can be
// unit-tested without a live Supabase/Svix round trip.

export function extractFeedback(payload: any): { submissionId: string | null; feedbackText: string | null } {
  const data = payload?.data ?? payload;
  const toRaw = data?.to;
  const toList: string[] = Array.isArray(toRaw) ? toRaw : typeof toRaw === 'string' ? [toRaw] : [];

  let submissionId: string | null = null;
  for (const addr of toList) {
    const match = /feedback\+([0-9a-f-]{36})@/i.exec(String(addr));
    if (match) {
      submissionId = match[1];
      break;
    }
  }

  const feedbackText: string | null =
    (typeof data?.text === 'string' && data.text.trim()) ||
    (typeof data?.html === 'string' && stripHtml(data.html).trim()) ||
    null;

  return { submissionId, feedbackText };
}

// Strips tags/scripts so a malicious inbound HTML reply can't smuggle
// markup or script content into feedbackText, which later gets embedded
// verbatim into an admin-notify email and passed as plain text to Claude.
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One free revision round only, per product rule — a submission that's
// already been revised (or hasn't reached "sent" yet) must not trigger a
// second automated re-run, whether from a genuine second reply or a
// webhook retry/duplicate delivery of the same event.
export function shouldProcessFeedback(row: { status: string; feedback_round: number }): boolean {
  return row.status === 'sent' && row.feedback_round < 1;
}
