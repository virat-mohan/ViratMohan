// Which brand does a WhatsApp expense or sale belong to? Everything may arrive
// on one shared number, so the brand is worked out in a fixed order and the
// winning step is recorded as tag_source for the audit trail:
//   1 text_alias     brand named in the text (aliases, small typos)
//   2 keyword        product / SKU words from the brand's keywords and catalogue
//   3 vendor_memory  this vendor was tagged to a brand before
//   4 sender_default the sender's default brand (ledger_senders)
//   5 group_name     the export's group name
//   6 claude         model fallback (caller runs it; its confidence is stored)
// More than one brand, a "shared"/"both" cost, or low confidence → one question.
// Shared costs are split by an allocation rule per vendor or category; with no
// rule yet, ask the first time.

export type BrandProfile = {
  brandKey: string;
  name: string;
  aliases?: string[];
  keywords?: string[];
  catalogue?: string[];
  groupNames?: string[];
};

export type Split = { brandKey: string; pct: number };
export type AllocationRule = { matchType: 'vendor' | 'category'; matchValue: string; splits: Split[] };
export type VendorRule = { vendor: string; brandKey: string | null; shared: boolean };

export type BrandIndex = { brands: BrandProfile[]; vendors: VendorRule[]; allocations: AllocationRule[] };

export type TagSource = 'text_alias' | 'keyword' | 'vendor_memory' | 'sender_default' | 'group_name' | 'claude' | 'allocation' | 'answer';

export type BrandTag = {
  brandKey: string | null;
  splits: Split[] | null; // set for a shared cost with a known allocation
  tagSource: TagSource | null;
  confidence: number;
  candidates: string[]; // brand keys in play when unsure
  question: string | null;
};

export const TAG_THRESHOLD = 0.8;
const CONF: Record<Exclude<TagSource, 'claude'>, number> = {
  text_alias: 0.95, keyword: 0.85, vendor_memory: 0.85, sender_default: 0.8, group_name: 0.85, allocation: 0.9, answer: 1,
};

export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s: string) => norm(s).split(' ').filter(Boolean);
const singular = (t: string) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Does a (possibly multi-word) term appear in the text's tokens? Typos allowed only for longer words. */
function mentions(textTokens: string[], term: string, fuzzy: boolean): boolean {
  const tt = tokens(term);
  if (!tt.length) return false;
  const eq = (a: string, b: string) => {
    if (a === b || singular(a) === singular(b)) return true;
    if (!fuzzy || b.length < 5) return false;
    return levenshtein(a, b) <= (b.length >= 8 ? 2 : 1);
  };
  for (let i = 0; i + tt.length <= textTokens.length; i++) {
    if (tt.every((t, k) => eq(textTokens[i + k], t))) return true;
  }
  return false;
}

const SHARED_WORDS = /\b(shared|both|split|common|all brands)\b/i;

export function brandQuestion(brands: BrandProfile[], candidates: string[], includeShared = true): string {
  const list = (candidates.length ? brands.filter((b) => candidates.includes(b.brandKey)) : brands);
  const opts = list.map((b, i) => `${i + 1} ${b.name}`);
  if (includeShared) opts.push(`${list.length + 1} Shared`);
  return `Which brand? ${opts.join(' ')}`;
}

/** Options in the order the question lists them; the last one may be 'shared'. */
export function questionOptions(brands: BrandProfile[], candidates: string[], includeShared = true): string[] {
  const list = (candidates.length ? brands.filter((b) => candidates.includes(b.brandKey)) : brands).map((b) => b.brandKey);
  return includeShared ? [...list, 'shared'] : list;
}

export function findAllocation(index: BrandIndex, vendor: string | null, category: string | null): AllocationRule | null {
  const v = vendor ? norm(vendor) : null;
  return (v && index.allocations.find((a) => a.matchType === 'vendor' && norm(a.matchValue) === v))
    || (category && index.allocations.find((a) => a.matchType === 'category' && a.matchValue === category))
    || null;
}

export function detectBrand(
  text: string,
  index: BrandIndex,
  ctx: { vendor?: string | null; category?: string | null; senderDefault?: string | null; groupName?: string | null } = {},
): BrandTag {
  const tt = tokens(text);
  const { brands } = index;
  const done = (brandKey: string, tagSource: Exclude<TagSource, 'claude'>): BrandTag =>
    ({ brandKey, splits: null, tagSource, confidence: CONF[tagSource], candidates: [brandKey], question: null });
  const shared = (candidates: string[]): BrandTag => {
    const rule = findAllocation(index, ctx.vendor ?? null, ctx.category ?? null);
    if (rule) return { brandKey: null, splits: rule.splits, tagSource: 'allocation', confidence: CONF.allocation, candidates: rule.splits.map((s) => s.brandKey), question: null };
    return { brandKey: null, splits: null, tagSource: null, confidence: 0, candidates, question: `Shared cost. How should I split it? Reply like 50/50 for ${brands.filter((b) => !candidates.length || candidates.includes(b.brandKey)).map((b) => b.name).join(' / ')}.` };
  };
  const ambiguous = (candidates: string[]): BrandTag =>
    ({ brandKey: null, splits: null, tagSource: null, confidence: 0, candidates, question: brandQuestion(brands, candidates) });

  // 1. Brand named in the text.
  const named = brands.filter((b) => [b.name, ...(b.aliases ?? [])].some((a) => mentions(tt, a, tokens(a).join('').length >= 5)));
  const saysShared = SHARED_WORDS.test(text);
  if (saysShared) return shared(named.map((b) => b.brandKey));
  if (named.length === 1) return done(named[0].brandKey, 'text_alias');
  if (named.length > 1) return ambiguous(named.map((b) => b.brandKey));

  // 2. Product / SKU words.
  const byWord = brands.filter((b) => [...(b.keywords ?? []), ...(b.catalogue ?? [])].some((k) => mentions(tt, k, false)));
  if (byWord.length === 1) return done(byWord[0].brandKey, 'keyword');
  if (byWord.length > 1) return ambiguous(byWord.map((b) => b.brandKey));

  // 3. Vendor memory.
  if (ctx.vendor) {
    const v = index.vendors.find((r) => norm(r.vendor) === norm(ctx.vendor!));
    if (v?.shared) return shared([]);
    if (v?.brandKey) return done(v.brandKey, 'vendor_memory');
  }

  // 4. Sender's default brand.
  if (ctx.senderDefault && brands.some((b) => b.brandKey === ctx.senderDefault)) return done(ctx.senderDefault, 'sender_default');

  // 5. Group name (exports).
  if (ctx.groupName) {
    const g = norm(ctx.groupName);
    const gt = tokens(ctx.groupName);
    const hits = brands.filter((b) => (b.groupNames ?? []).some((n) => norm(n) === g) || [b.name, ...(b.aliases ?? [])].some((a) => mentions(gt, a, false)));
    if (hits.length === 1) return done(hits[0].brandKey, 'group_name');
  }

  // 6. Unknown: caller may try Claude; otherwise ask.
  return ambiguous([]);
}

/** Parse a reply to a brand question: "1", "2", a brand name, "shared", or a split like "60/40". */
export function parseAnswer(reply: string, options: string[], brands: BrandProfile[]): { brandKey: string } | { shared: true } | { split: number[] } | null {
  const t = reply.trim();
  const split = /^(\d{1,3})(?:\s*[\/:,-]\s*(\d{1,3}))+$/.exec(t);
  if (split && t.includes('/')) {
    const parts = t.split(/\s*[\/:,-]\s*/).map(Number);
    if (parts.reduce((a, b) => a + b, 0) === 100) return { split: parts };
  }
  const n = /^(\d{1,2})$/.exec(t);
  if (n) {
    const o = options[Number(n[1]) - 1];
    if (!o) return null;
    return o === 'shared' ? { shared: true } : { brandKey: o };
  }
  if (SHARED_WORDS.test(t)) return { shared: true };
  const tt = tokens(t);
  const hit = brands.filter((b) => [b.name, ...(b.aliases ?? [])].some((a) => mentions(tt, a, true)));
  return hit.length === 1 ? { brandKey: hit[0].brandKey } : null;
}

/** Split an amount in paise by percentages; rounding remainder goes to the last brand so totals always match. */
export function splitAmount(paise: number, splits: Split[]): { brandKey: string; paise: number }[] {
  let left = paise;
  return splits.map((s, i) => {
    const p = i === splits.length - 1 ? left : Math.round((paise * s.pct) / 100);
    left -= p;
    return { brandKey: s.brandKey, paise: p };
  });
}
