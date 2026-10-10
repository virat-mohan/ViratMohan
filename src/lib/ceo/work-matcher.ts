// Does this request match Work that already exists? Prefers a missed match over a wrong one: attaching a
// request to the wrong Work is an operational mistake, while a missed match only costs a duplicate to merge.
// Deterministic and bounded; no AI invocations.
//
// Order of evidence: (the explicit Work reference is handled by the caller and always wins)
//   exact     the same subject words once brand names, generic words and tags are removed
//   strong    two or more subject words shared and at least 60% of all subject words in common
//   context   the same deployment target in the same brand (existing context, structured)
// Anything weaker is NOT attached; it is listed as "similar" for the Founder to confirm by reference.
// More than one strong candidate is ambiguous: the caller asks, it never guesses.

import type { InMemoryWorkRegistry } from '../work/registry';
import type { Scope, WorkItem } from '../work/types';
import { deploymentIntent } from './deployment-intent';

export type MatchBasis = 'exact' | 'strong_title' | 'context';
export interface Candidate { item: WorkItem; basis: MatchBasis; similarity: number }
export interface MatchResult {
  status: 'none' | 'match' | 'ambiguous';
  match: WorkItem | null;
  candidates: Candidate[];
  similar: WorkItem[];
}

export const MAX_SCAN = 300;
const MAX_CANDIDATES = 5;
const MAX_SIMILAR = 3;
const MIN_SHARED = 2;
const MIN_JACCARD = 0.6;

// Brand names are the scope, not the subject: two Moon requests are not the same request because both say "Moon".
const BRAND_WORDS = new Set(['moon', 'moonglasses', 'glasses', 'travaholic', 'trav', 'caps', 'cap', 'ceremony', 'kitchen', 'freshforpaws', 'fresh', 'paws', 'korbi', 'devshop', 'retail']);
const GENERIC_WORDS = new Set([
  'the', 'and', 'for', 'with', 'our', 'this', 'that', 'from', 'into', 'please', 'need', 'needs', 'want', 'you', 'can', 'could', 'would', 'should', 'have', 'has', 'are', 'was', 'were', 'not', 'all', 'any', 'new', 'now', 'today',
  'fix', 'fixes', 'handle', 'resolve', 'issue', 'issues', 'problem', 'problems', 'bug', 'bugs', 'page', 'pages', 'site', 'update', 'updates', 'check', 'make', 'set', 'get', 'look', 'work', 'working', 'thing', 'things', 'stuff', 'request', 'task', 'item',
  'asap', 'urgent', 'urgently', 'critical', 'down', 'broken', 'ceo', 'dev',
]);

export function subjectWords(text: string): Set<string> {
  const words = text.toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w) && !BRAND_WORDS.has(w));
  return new Set(words);
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((w) => b.has(w));

export function matchExistingWork(registry: InMemoryWorkRegistry, text: string, scope: Scope): MatchResult {
  const mine = subjectWords(text);
  const myIntent = deploymentIntent(text);
  const open = registry.list()
    .filter((i) => i.state !== 'closed' && i.merged_into === null && i.scope.brand === scope.brand)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, MAX_SCAN);

  const strong: Candidate[] = [];
  const weak: { item: WorkItem; similarity: number }[] = [];
  for (const item of open) {
    const theirs = subjectWords(item.title);
    const shared = [...mine].filter((w) => theirs.has(w)).length;
    const union = new Set([...mine, ...theirs]).size;
    const similarity = union ? shared / union : 0;
    const itemIntent = deploymentIntent(item.title);
    if (mine.size > 0 && sameSet(mine, theirs)) strong.push({ item, basis: 'exact', similarity: 1 });
    else if (shared >= MIN_SHARED && similarity >= MIN_JACCARD) strong.push({ item, basis: 'strong_title', similarity });
    else if (myIntent?.target && itemIntent?.target === myIntent.target) strong.push({ item, basis: 'context', similarity });
    else if (shared >= 1) weak.push({ item, similarity });
  }
  strong.sort((a, b) => b.similarity - a.similarity);
  const similar = weak.sort((a, b) => b.similarity - a.similarity).slice(0, MAX_SIMILAR).map((w) => w.item);
  const candidates = strong.slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return { status: 'none', match: null, candidates: [], similar };
  if (candidates.length === 1) return { status: 'match', match: candidates[0].item, candidates, similar };
  return { status: 'ambiguous', match: null, candidates, similar };
}
