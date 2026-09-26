export const prerender = false;
import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { getFaqDb, rewordAnswer, FAQ_TOPICS } from '../../../../lib/retail-os-faq';
import { json, readJson } from '../../../../lib/retail-os-http';
import { knowledgeLoop } from '../../../../lib/knowledge-loop';

// Gated by src/middleware.ts ('/retail-os/api/admin' is a protected prefix).
type Body = { action?: string; id?: string; question?: string; rawAnswer?: string; answer?: string; topic?: string };
export const POST: APIRoute = async ({ request }) => {
  const b = await readJson<Body>(request);
  if (!b?.action) return json({ error: 'action is required' }, 400);
  const env = getEnv();
  const db = getFaqDb(env);
  try {
    if (b.action === 'reword') {
      if (!b.question || !b.rawAnswer) return json({ error: 'question and rawAnswer are required' }, 400);
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY is not set' }, 500);
      const entry = await rewordAnswer(env.ANTHROPIC_API_KEY, b.question, b.rawAnswer, FAQ_TOPICS);
      if (b.id) await db.update(b.id, { raw_answer: b.rawAnswer });
      return json(entry, 200);
    }
    if (b.action === 'add') {
      if (!b.question?.trim()) return json({ error: 'question is required' }, 400);
      return json({ id: await db.addManual(b.question.trim()) }, 200);
    }
    if (!b.id) return json({ error: 'id is required' }, 400);
    const loop = knowledgeLoop(env);
    if (b.action === 'publish') {
      if (!b.question?.trim() || !b.answer?.trim()) return json({ error: 'question and answer are required' }, 400);
      const topic = FAQ_TOPICS.includes(b.topic || '') ? b.topic! : 'Getting started';
      await db.update(b.id, { status: 'published', published_question: b.question.trim(), answer: b.answer.trim(), topic, raw_answer: b.rawAnswer ?? null, published_at: new Date().toISOString() });
      // Published means known everywhere: the FAQ page, the site chat and email drafts all recall it from the Brain.
      await loop.learnPublished({ id: b.id, question: b.question.trim(), answer: b.answer.trim(), topic });
      return json({ ok: true }, 200);
    }
    if (b.action === 'dismiss') { await db.update(b.id, { status: 'dismissed' }); await loop.forgetPublished(b.id); return json({ ok: true }, 200); }
    if (b.action === 'reopen') { await db.update(b.id, { status: 'open' }); await loop.forgetPublished(b.id); return json({ ok: true }, 200); }
    return json({ error: 'unknown action' }, 400);
  } catch (err) {
    console.error('faq admin failed', err);
    return json({ error: err instanceof Error ? err.message : 'failed' }, 500);
  }
};
