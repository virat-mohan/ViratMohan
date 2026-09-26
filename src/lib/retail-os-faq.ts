import { createClient } from '@supabase/supabase-js';
import type { Env } from './env';

// Partner FAQ inbox — see migrations/0027_retail_os_faq.sql.
export type FaqQuestion = {
  id: string; question: string; reason: string | null; ask_count: number;
  status: 'open' | 'published' | 'dismissed'; topic: string | null;
  raw_answer: string | null; answer: string | null; published_question: string | null;
  created_at: string; last_asked_at: string; published_at: string | null;
};

export const FAQ_TOPICS = [
  'Getting started', 'Onboarding', 'Front end', 'Admin', 'Reports',
  'Social & content', 'Performance', 'Integrations', 'Payments',
  'Shipping & returns', 'WhatsApp', 'Customers & loyalty', 'Commercials',
];

export function questionKey(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function client(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export function getFaqDb(env: Env) {
  const sb = client(env);
  const T = 'retail_os_faq_questions';
  return {
    async log(question: string, reason: string) {
      const key = questionKey(question);
      if (!key) return;
      const { data: existing } = await sb.from(T).select('id, ask_count').eq('question_key', key).maybeSingle();
      if (existing) {
        await sb.from(T).update({ ask_count: existing.ask_count + 1, last_asked_at: new Date().toISOString() }).eq('id', existing.id);
        return;
      }
      const { error } = await sb.from(T).insert({ question: question.slice(0, 500), question_key: key, reason });
      if (error) throw new Error(error.message);
    },
    async list(): Promise<FaqQuestion[]> {
      const { data, error } = await sb.from(T).select('*').order('status').order('last_asked_at', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as FaqQuestion[];
    },
    async published() {
      const { data, error } = await sb.from(T).select('published_question, question, answer, topic').eq('status', 'published').order('published_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ q: r.published_question || r.question, a: r.answer, topic: r.topic || 'Getting started' }));
    },
    async update(id: string, patch: Partial<FaqQuestion>) {
      const { error } = await sb.from(T).update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async addManual(question: string) {
      const { data, error } = await sb.from(T).insert({ question, question_key: questionKey(question) + ' ' + Date.now(), reason: 'manual' }).select('id').single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
  };
}

// Rewords a WhatsApp reply into the FAQ's voice: first person, plain, short,
// no selling, nothing added that the reply did not say.
export async function rewordAnswer(apiKey: string, question: string, rawAnswer: string, topics: string[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 600,
      system: `You turn Virat Mohan's WhatsApp replies into entries for the DevShop Retail OS partner FAQ.
Rules: first person as Virat. Plain, short, straightforward: one to three sentences. No selling, no hype, no emojis, no em-dashes.
Use ONLY facts in his reply. Never add features, numbers, prices or promises he did not state.
Commercial terms (pricing, profit split, settlement, contract length, exit fees) are never stated on the FAQ: if the reply is about those, answer that they are set out in the partnership agreement and to WhatsApp him.
Also tidy the partner's question into a short, clear FAQ question, and pick the best topic from the list.`,
      tool_choice: { type: 'tool', name: 'faq_entry' },
      tools: [{
        name: 'faq_entry',
        description: 'The FAQ entry to publish.',
        input_schema: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
            topic: { type: 'string', enum: topics },
          },
          required: ['question', 'answer', 'topic'],
        },
      }],
      messages: [{ role: 'user', content: `Partner's question:\n${question}\n\nVirat's WhatsApp reply:\n${rawAnswer}` }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const block = (data.content || []).find((b: { type: string }) => b.type === 'tool_use');
  if (!block) throw new Error('No FAQ entry returned');
  return block.input as { question: string; answer: string; topic: string };
}
