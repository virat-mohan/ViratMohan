// The Brain: one unit that knows the business. Every feature asks it.
//   recall(query)                 hybrid retrieval over sourced facts and entities
//   classify(item, schema)        learned rules first, then retrieval + Claude
//   answer(question, {audience})  grounded answer with citations, or "I don't know" + request_virat
//   learn(correction)             correction -> rule that wins next time
//   decide(situation)             PLAYBOOK decision test: "act alone" or "ask Virat"
//   communicate(to, purpose, msg) channel, send_after, dedupe key; hands off to notify()
import { createClient } from '@supabase/supabase-js';
import { createBrain, type BrainDeps } from './brain';
import { SupabaseStore } from './store';
import { fetchClaude } from './claude';
import type { ClassifySchema, NotifyPort } from './types';

export * from './types';
export { createBrain, effectiveAudience, deriveMatch, ruleMatches, type Brain, type Answer } from './brain';
export { MemoryStore, SupabaseStore, type BrainStore } from './store';
export { MODEL_ROUTINE, MODEL_HIGH_STAKES, fetchClaude, type ClaudeClient } from './claude';
export { decide } from './decide';
export { planMessage, chooseChannel, sendAfter, dedupeKey } from './communicate';

/** Schemas the ledger work calls classify() with. Labels are theirs to extend. */
export const EXPENSE_TAG: ClassifySchema = {
  name: 'expense_tag',
  labels: ['product', 'packaging', 'shipping', 'payment_fees', 'platform_fees', 'marketing', 'tech', 'admin', 'deposit_adjustment', 'other'],
  description: 'Tag a ledger line with the cost bucket used in the profit pool (product and packaging, CAC, admin and tech).',
};
export const SETTLEMENT_MATCH: ClassifySchema = {
  name: 'settlement_match',
  labels: ['matched', 'partial', 'unmatched', 'needs_virat'],
  description: 'Does this bank/payment line reconcile to the ledger entry given in the item?',
  highStakes: true,
};
export const BRAND_OF: (brands: string[]) => ClassifySchema = (brands) => ({
  name: 'brand_of', labels: [...brands, 'unknown'], description: 'Which brand does this line/message belong to?',
});

type ServerEnv = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; ANTHROPIC_API_KEY?: string };

/** Server-side Brain on Supabase + Claude. `notify` is the outbox owner's implementation. */
export function serverBrain(env: ServerEnv, extra: { notify?: NotifyPort } & Partial<BrainDeps> = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('brain: Supabase not configured');
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return createBrain({ store: new SupabaseStore(sb), claude: env.ANTHROPIC_API_KEY ? fetchClaude(env.ANTHROPIC_API_KEY) : undefined, ...extra });
}
