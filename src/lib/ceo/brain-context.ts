// Brain → CEO bridge: scoped memory retrieval for the CEO operating context.
// Pre-fetches relevant facts, entities and rules from the Brain store so the
// deterministic CEO orchestrator can reference them without async calls.
// Scoping: company/Retail OS facts use 'staff' audience; brand-specific facts
// filter by brand key. Context budget caps total evidence items.

import type { BrainStore } from '../brain/store';
import type { Evidence, Rule } from '../brain/types';

export interface BrainContext {
  companyFacts: Evidence[];
  brandFacts: Evidence[];
  rules: Rule[];
  strategicPriorities: Evidence[];
  orgLines: Evidence[];
  learnings: Evidence[];
  totalItems: number;
}

const EMPTY: BrainContext = {
  companyFacts: [], brandFacts: [], rules: [],
  strategicPriorities: [], orgLines: [], learnings: [], totalItems: 0,
};

export function emptyBrainContext(): BrainContext {
  return { ...EMPTY };
}

export interface BrainContextOpts {
  brand?: string | null;
  contextBudget?: number;
  queryHints?: string[];
}

export async function fetchBrainContext(
  store: BrainStore,
  opts: BrainContextOpts = {},
): Promise<BrainContext> {
  const budget = opts.contextBudget ?? 30;
  const perQuery = Math.max(3, Math.floor(budget / 6));

  const [companyFacts, rules, strategicPriorities, orgLines, learnings] = await Promise.all([
    store.search('company facts mission values vision', 'staff', perQuery),
    store.rules('ceo_governance'),
    store.search('strategic priorities north star objectives', 'staff', perQuery),
    store.search('org structure reporting lines agents', 'staff', perQuery),
    store.search('learnings mistakes rules validated', 'staff', perQuery),
  ]);

  let brandFacts: Evidence[] = [];
  if (opts.brand) {
    brandFacts = await store.search(`${opts.brand} brand foundation identity`, 'staff', perQuery);
  }

  const ctx: BrainContext = {
    companyFacts,
    brandFacts,
    rules,
    strategicPriorities,
    orgLines,
    learnings,
    totalItems: companyFacts.length + brandFacts.length + rules.length +
      strategicPriorities.length + orgLines.length + learnings.length,
  };

  return ctx;
}

export function brainContextSummary(ctx: BrainContext): string {
  const parts: string[] = [];
  if (ctx.companyFacts.length > 0) parts.push(`${ctx.companyFacts.length} company facts`);
  if (ctx.brandFacts.length > 0) parts.push(`${ctx.brandFacts.length} brand facts`);
  if (ctx.rules.length > 0) parts.push(`${ctx.rules.length} governance rules`);
  if (ctx.strategicPriorities.length > 0) parts.push(`${ctx.strategicPriorities.length} strategic priorities`);
  if (ctx.orgLines.length > 0) parts.push(`${ctx.orgLines.length} org lines`);
  if (ctx.learnings.length > 0) parts.push(`${ctx.learnings.length} learnings`);
  return parts.length > 0 ? `Brain context: ${parts.join(', ')}.` : 'No brain context loaded.';
}
