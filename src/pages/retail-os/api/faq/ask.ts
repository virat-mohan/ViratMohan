export const prerender = false;
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { getFaqDb } from '../../../../lib/retail-os-faq';
import { json, readJson } from '../../../../lib/retail-os-http';
import { endpointLimit } from '../../../../lib/rate-limit';

// Public and unauthenticated. Writes a question into the shared inbox.
const limit = endpointLimit({ rules: [{ limit: 5, windowMs: 60_000 }, { limit: 30, windowMs: 3_600_000 }], body: { ok: false } });

// Public: the FAQ page logs questions its search could not answer.
const REASONS = ['no_match', 'weak_match', 'sent_to_whatsapp'];
export const POST: APIRoute = async ({ request }) => {
  const limited = limit(request);
  if (limited) return limited;
  const body = await readJson<{ question?: string; reason?: string }>(request);
  const question = (body?.question || '').trim();
  if (question.length < 4 || question.length > 500) return json({ ok: false }, 400);
  const reason = REASONS.includes(body?.reason || '') ? body!.reason! : 'no_match';
  try {
    await getFaqDb(getEnv()).log(question, reason);
    return json({ ok: true }, 200);
  } catch (err) {
    console.error('faq ask log failed', err);
    return json({ ok: false }, 500);
  }
};
