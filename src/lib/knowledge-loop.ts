// The knowledge loop: one inbox of questions, one set of answers, shared by the
// site chat, the lead email assistant and the public FAQ.
//
//   question nobody could answer  ->  retail_os_faq_questions (open)      noteUnanswered()
//   Virat answers a lead by email ->  same row, raw_answer pre-filled      noteAnswered()
//   Virat publishes in /admin/faq ->  public Brain fact (source faq:<id>)  learnPublished()
//   Virat unpublishes             ->  fact retired (valid_to = now)        forgetPublished()
//
// Both bots recall Brain facts, so an answer learned from an email reaches the
// chat, and an answer learned from WhatsApp or the FAQ reaches email drafts.
// Nothing becomes public knowledge until Virat publishes it (PLAYBOOK: humans decide).
import { createClient } from '@supabase/supabase-js';
import { getFaqDb } from './retail-os-faq';

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };

export type Via = 'chat' | 'email';
export const REASON_UNANSWERED: Record<Via, string> = { chat: 'chat_no_match', email: 'email_no_match' };
export const REASON_ANSWERED = 'email_answer';

/** Where a published FAQ answer lives in the Brain. */
export const faqSource = (id: string) => `faq:${id}`;

/** Pull the first real question out of free text (a chat message or an email body). */
export function questionIn(text: string): string | null {
  const clean = text.split(/\n\s*(On .+wrote:|From: .+|-----Original Message-----)/)[0];
  const lines = clean.split(/\n+/).map((l) => l.replace(/^\s*(\d+[.)]|[-*•>])\s*/, '').trim());
  const q = lines.find((l) => l.includes('?') && l.length >= 12);
  if (!q) return null;
  const sentence = q.split(/(?<=\?)\s+/).find((s) => s.includes('?')) ?? q;
  return sentence.replace(/\s+/g, ' ').trim().slice(0, 400) || null;
}

/** The part of a reply that is new text: nothing quoted, no signature. */
export function replyText(body: string): string {
  const own = body.split(/\n\s*(On .+wrote:|From: .+|-----Original Message-----|-- ?\n|__+|Sent from my)/)[0] ?? body;
  return own.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n')
    .replace(/\n\s*(Best|Regards|Thanks|Warm regards|Cheers)[,.]?\s*\n[\s\S]*$/i, '')
    .replace(/\n\s*Virat(\s+Mohan)?\s*$/i, '').trim();
}

export function knowledgeLoop(env: Env) {
  const faq = getFaqDb(env);
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  return {
    /** A bot was asked something it could not answer. Logged once per distinct question, counted on repeats. */
    async noteUnanswered(question: string, via: Via, ctx: { source?: string; leadId?: string } = {}) {
      const q = questionIn(question) ?? question.replace(/\s+/g, ' ').trim().slice(0, 400);
      if (q.length < 8) return;
      await faq.log(q, REASON_UNANSWERED[via], { source: ctx.source, leadId: ctx.leadId });
    },

    /** Virat answered a lead's question himself (by email). Keep the pair so he can publish it in one step. */
    async noteAnswered(question: string, rawAnswer: string, ctx: { source?: string; leadId?: string; answerSource?: string }) {
      const q = questionIn(question) ?? question.replace(/\s+/g, ' ').trim().slice(0, 400);
      const a = replyText(rawAnswer);
      if (q.length < 8 || a.length < 15) return;
      await faq.log(q, REASON_ANSWERED, { rawAnswer: a, source: ctx.source, leadId: ctx.leadId, answerSource: ctx.answerSource });
    },

    /** A published FAQ entry becomes a public, sourced Brain fact both bots can recall. */
    async learnPublished(entry: { id: string; question: string; answer: string; topic: string | null }) {
      const source = faqSource(entry.id);
      const statement = `Q: ${entry.question}\nA: ${entry.answer}`;
      // A re-publish with new wording replaces the old statement rather than adding a second one.
      await sb.from('brain_facts').delete().eq('source', source).neq('statement', statement);
      const { error } = await sb.from('brain_facts').upsert(
        { topic: `faq: ${entry.topic || 'Getting started'}`, statement, source, confidence: 1, confirmed_by: 'virat', visibility: 'public', valid_to: null },
        { onConflict: 'source,statement' },
      );
      if (error) throw new Error(`knowledge loop learn failed: ${error.message}`);
      await sb.from('brain_events').insert({ type: 'learn', actor: 'virat', payload: { kind: 'faq_published', faq_id: entry.id, topic: entry.topic }, visibility: 'staff' });
    },

    /** Unpublished or dismissed: the fact stops being recalled but stays on record. */
    async forgetPublished(id: string) {
      const { error } = await sb.from('brain_facts').update({ valid_to: new Date().toISOString() }).eq('source', faqSource(id)).is('valid_to', null);
      if (error) throw new Error(`knowledge loop forget failed: ${error.message}`);
    },
  };
}

export type KnowledgeLoop = ReturnType<typeof knowledgeLoop>;
