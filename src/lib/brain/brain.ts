import type { BrainStore } from './store';
import { tokens } from './store';
import { type ClaudeClient, parseJson } from './claude';
import { STABLE_PREFIX } from './knowledge';
import { decide as decideSituation } from './decide';
import { communicate as communicateImpl } from './communicate';
import type {
  Audience, ClassifyResult, ClassifySchema, Correction, Decision, Embedder, Evidence, NotifyPort,
  Purpose, Recipient, Rule, RuleMatch, Situation, Visibility,
} from './types';

export type BrainDeps = { store: BrainStore; claude?: ClaudeClient; notify?: NotifyPort; embed?: Embedder; now?: () => Date };

export type Answer = {
  answer: string;
  citations: Evidence[];
  known: boolean;
  escalate?: { tool: 'request_virat'; why: string };
};

const HIGH_STAKES = /\b(price|pricing|terms?|split|fee|deposit|contract|refund|legal|tax|gst|payout|settle|invest)/i;
const MIN_SCORE = 0.05;

/** Staff audience only when the caller proved authentication; everything else is treated as public/partner. */
export function effectiveAudience(a: Audience | undefined): Visibility {
  if (!a) return 'public';
  if (a.audience === 'staff') return a.authenticated ? 'staff' : 'public';
  if (a.audience === 'partner') return a.authenticated ? 'partner' : 'public';
  return 'public';
}

const itemText = (item: Record<string, unknown>) => Object.entries(item).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('\n');

export function ruleMatches(m: RuleMatch, item: Record<string, unknown>): boolean {
  const raw = item[m.field];
  if (raw == null) return false;
  const v = String(raw).toLowerCase(), want = m.value.toLowerCase();
  if (m.op === 'equals') return v.trim() === want.trim();
  if (m.op === 'contains') return v.includes(want);
  try { return new RegExp(m.value, 'i').test(String(raw)); } catch { return false; }
}

const SPECIFICITY = { equals: 3, regex: 2, contains: 1 } as const;
const MATCH_FIELDS = ['vendor', 'merchant', 'payee', 'sender', 'counterparty', 'brand', 'narration', 'description', 'text', 'memo'];

/** Derive a rule from a corrected item when the corrector didn't give one. */
export function deriveMatch(item: Record<string, unknown>): RuleMatch | null {
  for (const f of MATCH_FIELDS) {
    const v = item[f];
    if (typeof v !== 'string' || !v.trim()) continue;
    if (['vendor', 'merchant', 'payee', 'sender', 'counterparty', 'brand'].includes(f)) return { field: f, op: 'equals', value: v.trim() };
    // Free text: key on the longest distinctive word.
    const t = tokens(v).filter((w) => !/^\d+$/.test(w)).sort((a, b) => b.length - a.length)[0];
    if (t) return { field: f, op: 'contains', value: t };
  }
  return null;
}

export function createBrain(deps: BrainDeps) {
  const { store, claude, notify, embed } = deps;
  const now = deps.now ?? (() => new Date());

  /** Hybrid retrieval: full-text + exact name/alias (in the store) fused with vector search when available. */
  async function recall(query: string, opts: { audience?: Audience; limit?: number } = {}): Promise<Evidence[]> {
    const aud = effectiveAudience(opts.audience);
    const limit = opts.limit ?? 8;
    const lists: Evidence[][] = [await store.search(query, aud, limit * 2)];
    if (embed && store.searchVector) {
      try { lists.push(await store.searchVector(await embed(query), aud, limit * 2)); } catch (e) { console.error('brain vector recall', e); }
    }
    // Reciprocal rank fusion.
    const fused = new Map<string, Evidence & { rrf: number }>();
    for (const list of lists) list.forEach((e, i) => {
      const cur = fused.get(e.id) ?? { ...e, rrf: 0 };
      cur.rrf += 1 / (60 + i); cur.score = Math.max(cur.score, e.score); fused.set(e.id, cur);
    });
    return [...fused.values()].filter((e) => e.score >= MIN_SCORE).sort((a, b) => b.rrf - a.rrf || b.score - a.score).slice(0, limit)
      .map(({ rrf: _rrf, ...e }) => e);
  }

  const evidenceBlock = (ev: Evidence[]) => ev.map((e) => `[${e.id}] (${e.kind}; source: ${e.source}) ${e.title}: ${e.body}`).join('\n');

  /** Rules first; then retrieval plus Claude. */
  async function classify(item: Record<string, unknown>, schema: ClassifySchema, opts: { audience?: Audience } = {}): Promise<ClassifyResult> {
    const rules = (await store.rules(schema.name)).filter((r) => r.active && schema.labels.includes(r.outcome) && ruleMatches(r.match, item));
    rules.sort((a, b) => SPECIFICITY[b.match.op] - SPECIFICITY[a.match.op] || b.confidence - a.confidence || b.hits - a.hits);
    const rule = rules[0];
    if (rule) {
      await store.updateRule(rule.id, { hits: rule.hits + 1, last_used: now().toISOString() });
      await store.log({ type: 'classify', payload: { schema: schema.name, via: 'rule', rule: rule.id, answer: rule.outcome }, evidence: [rule.id] });
      return { answer: rule.outcome, confidence: rule.confidence, why: [rule.id], via: 'rule' };
    }
    if (!claude) return { answer: null, confidence: 0, why: [], via: 'none' };
    const text = itemText(item);
    const ev = await recall(text, { audience: opts.audience ?? { audience: 'staff', authenticated: true }, limit: 8 });
    const res = await claude.complete({
      stakes: schema.highStakes ? 'high' : 'routine',
      stablePrefix: STABLE_PREFIX,
      system: `Task: classify the item for "${schema.name}". ${schema.description ?? ''}\nAllowed labels: ${schema.labels.join(', ')}.\nReply with JSON only: {"answer": <label or null>, "confidence": 0..1, "evidence_ids": [ids you relied on]}. Use null when unsure.`,
      user: `EVIDENCE:\n${evidenceBlock(ev) || '(none)'}\n\nITEM:\n${text}`,
      maxTokens: 200,
    });
    const out = parseJson<{ answer: string | null; confidence: number; evidence_ids: string[] }>(res.text);
    const known = new Set(ev.map((e) => e.id));
    const answer = out?.answer && schema.labels.includes(out.answer) ? out.answer : null;
    const confidence = answer ? Math.max(0, Math.min(1, Number(out?.confidence) || 0)) : 0;
    const why = (out?.evidence_ids ?? []).filter((x) => known.has(x));
    await store.log({ type: 'classify', payload: { schema: schema.name, via: 'model', model: res.model, answer, confidence }, evidence: why });
    return { answer, confidence: why.length ? confidence : Math.min(confidence, 0.6), why, via: 'model' };
  }

  /** Grounded answer with citations; "I don't know" + request_virat when evidence is missing. */
  async function answer(question: string, opts: { audience?: Audience } = {}): Promise<Answer> {
    const aud = effectiveAudience(opts.audience);
    const ev = await recall(question, { audience: opts.audience, limit: 8 });
    const dontKnow = async (why: string): Promise<Answer> => {
      await store.log({ type: 'escalate', payload: { question, audience: aud, why }, visibility: 'staff' });
      return { answer: "I don't know that yet. I've asked Virat to confirm, and he'll get back to you on WhatsApp.", citations: [], known: false, escalate: { tool: 'request_virat', why } };
    };
    if (!ev.length) return dontKnow('No evidence in the Brain for this question.');
    if (!claude) return dontKnow('No model available to compose an answer.');
    const res = await claude.complete({
      stakes: HIGH_STAKES.test(question) ? 'high' : 'routine',
      stablePrefix: STABLE_PREFIX,
      system: `Audience: ${aud}. Answer in two or three short sentences in Virat's voice, citing evidence ids like [id]. If the evidence does not answer the question, reply exactly NO_EVIDENCE.`,
      user: `EVIDENCE:\n${evidenceBlock(ev)}\n\nQUESTION: ${question}`,
    });
    const text = res.text.trim();
    const cited = ev.filter((e) => text.includes(`[${e.id}]`));
    if (!text || /NO_EVIDENCE/.test(text) || !cited.length) return dontKnow(!cited.length && text && !/NO_EVIDENCE/.test(text) ? 'Model answered without citing evidence.' : 'Evidence did not cover the question.');
    await store.log({ type: 'answer', payload: { question, audience: aud, model: res.model }, evidence: cited.map((c) => c.id), visibility: aud });
    return { answer: text, citations: cited, known: true };
  }

  /** Learn from a correction: log it, turn it into a rule that wins next time, retire the rule that was wrong. */
  async function learn(c: Correction): Promise<{ rule: Rule | null; eventId: string }> {
    const eventId = await store.log({ type: 'learn', actor: c.by, payload: { ...c } });
    const match = c.match ?? deriveMatch(c.item);
    if (!match) return { rule: null, eventId };
    const existing = await store.rules(c.schema);
    const same = existing.filter((r) => r.match.field === match.field && r.match.op === match.op && r.match.value.toLowerCase() === match.value.toLowerCase());
    const agree = same.find((r) => r.outcome === c.right);
    if (agree) { await store.updateRule(agree.id, { confidence: Math.min(0.99, agree.confidence + 0.02) }); return { rule: agree, eventId }; }
    const rule = await store.insertRule({
      schema_name: c.schema, match, outcome: c.right, confidence: c.by === 'virat' ? 0.97 : 0.9,
      created_from_correction: eventId, created_by: c.by, active: true, superseded_by: null,
    });
    // Retire rules that gave the wrong answer on this item.
    for (const r of existing) {
      if (r.outcome !== c.right && ruleMatches(r.match, c.item) && SPECIFICITY[r.match.op] <= SPECIFICITY[match.op]) await store.updateRule(r.id, { active: false, superseded_by: rule.id });
    }
    return { rule, eventId };
  }

  async function decide(s: Situation): Promise<Decision> {
    const d = decideSituation(s);
    await store.log({ type: 'decide', payload: { situation: s, verdict: d.verdict, reasons: d.reasons } });
    return d;
  }

  async function communicate(recipient: Recipient, purpose: Purpose, content: string) {
    const out = await communicateImpl(notify, recipient, purpose, content, now());
    await store.log({ type: 'communicate', payload: { channel: out.channel, why: out.why, sendAfter: out.sendAfter, dedupeKey: out.dedupeKey, purpose: purpose.kind, status: out.dispatched?.status ?? 'planned' } });
    return out;
  }

  /** Context block for the site chat: retrieved evidence to ground the existing chat prompt. */
  async function chatContext(question: string, audience?: Audience) {
    const ev = await recall(question, { audience, limit: 6 });
    return { evidence: ev, block: ev.length ? `\n\nBRAIN EVIDENCE (cite nothing outside this and the FAQ; if neither covers it, say you don't know and that Virat will confirm on WhatsApp):\n${evidenceBlock(ev)}` : '' };
  }

  return { recall, classify, answer, learn, decide, communicate, chatContext };
}

export type Brain = ReturnType<typeof createBrain>;
