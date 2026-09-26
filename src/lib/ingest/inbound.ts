// One inbound WhatsApp message (Cloud API) → ledger, with the I/O injected so
// the whole flow is unit-testable.
//   • idempotent on the WhatsApp message id
//   • only allowlisted senders (ledger_senders) ever write; anyone else gets a
//     polite reply and goes to the lead flow
//   • commands: "undo" (reject the sender's last unsettled entry), "summary"
//   • brand: detectBrand order, then Claude, then one question
//     "Which brand? 1 Moonglasses 2 Travaholic 3 Shared"; the answer becomes a vendor rule
//   • anything unclear is needs_review and never reaches a payout
//   • replies "Logged: ₹X what · Brand · mode"
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { LedgerRow } from '../ledger';
import {
  brandQuestion, detectBrand, parseAnswer, questionOptions, splitAmount, TAG_THRESHOLD,
  type BrandIndex, type BrandTag, type Split,
} from './brand-detect';
import { classifyMessage, formatInr, REVIEW_THRESHOLD, markDuplicates, toLedgerRow, type Classified, type KnownOrder } from './whatsapp';

export type Sender = { phone: string; name: string; defaultBrand: string | null; role: string };
export type OpenQuestion = { id: string; entryId: string | null; vendor: string | null; options: string[] };
export type Inbound = { messageId: string; from: string; text: string; at: string; mediaId?: string | null };

export type InboundDeps = {
  markSeen: (messageId: string, phone: string) => Promise<boolean>; // false if already handled
  findSender: (phone: string) => Promise<Sender | null>;
  loadIndex: () => Promise<BrandIndex>;
  openQuestion: (phone: string) => Promise<OpenQuestion | null>;
  askQuestion: (q: { phone: string; entryId: string | null; vendor: string | null; options: string[] }) => Promise<void>;
  closeQuestion: (id: string) => Promise<void>;
  saveVendorRule: (r: { vendor: string; brandKey: string | null; shared: boolean; splits: Split[] | null; by: string }) => Promise<void>;
  insertRows: (rows: LedgerRow[]) => Promise<{ id: string; source_id: string }[]>;
  getEntry: (id: string) => Promise<(LedgerRow & { id: string }) | null>;
  setEntry: (id: string, patch: { brand_key?: string; review_status?: string; tag_source?: string; tag_confidence?: number }) => Promise<void>;
  lastEntry: (phone: string) => Promise<(LedgerRow & { id: string }) | null>; // newest unsettled, not rejected
  weekSummary: (brandKey: string) => Promise<{ sales: number; costs: number; count: number }>;
  knownOrders: (atIso: string) => Promise<KnownOrder[]>;
  claudeBrand?: (text: string) => Promise<{ brandKey: string | null; confidence: number } | null>;
  reply: (to: string, text: string) => Promise<void>; // immediate reply (notify with replyToInbound)
  toLead: (m: Inbound) => Promise<void>;
};

export type InboundResult =
  | 'duplicate' | 'not_allowlisted' | 'undone' | 'nothing_to_undo' | 'summary' | 'answered' | 'ignored' | 'logged' | 'needs_review' | 'asked';

/** Meta's X-Hub-Signature-256: "sha256=" + hex HMAC-SHA256(raw body, app secret). */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Pull text messages out of a Cloud API webhook payload. */
export function extractMessages(body: any): Inbound[] {
  const out: Inbound[] = [];
  for (const entry of body?.entry ?? []) for (const ch of entry?.changes ?? []) for (const m of ch?.value?.messages ?? []) {
    const text = m.text?.body ?? m.image?.caption ?? m.document?.caption ?? '';
    out.push({ messageId: String(m.id), from: String(m.from), text: String(text), at: new Date(Number(m.timestamp) * 1000).toISOString(), mediaId: m.image?.id ?? m.document?.id ?? null });
  }
  return out;
}

const brandName = (index: BrandIndex, key: string | null) => index.brands.find((b) => b.brandKey === key)?.name ?? 'Unassigned';
const modeLabel = (m: Classified['mode']) => (m ? (m === 'upi' ? 'UPI' : m[0].toUpperCase() + m.slice(1)) : 'mode not said');
export const loggedText = (paise: number, what: string, brand: string, mode: Classified['mode']) =>
  `Logged: ${formatInr(paise)} ${what} · ${brand} · ${modeLabel(mode)}`;

export async function handleInbound(m: Inbound, deps: InboundDeps): Promise<InboundResult> {
  if (!(await deps.markSeen(m.messageId, m.from))) return 'duplicate';
  const sender = await deps.findSender(m.from);
  if (!sender) {
    await deps.reply(m.from, 'Thanks for your message. I will get back to you soon. – Virat');
    await deps.toLead(m);
    return 'not_allowlisted';
  }
  const text = m.text.trim();
  const cmd = text.toLowerCase();
  const index = await deps.loadIndex();

  if (cmd === 'undo') {
    const last = await deps.lastEntry(m.from);
    if (!last) { await deps.reply(m.from, 'Nothing to undo.'); return 'nothing_to_undo'; }
    await deps.setEntry(last.id, { review_status: 'rejected' });
    await deps.reply(m.from, `Undone: ${formatInr(last.amount_paise)} ${last.description ?? ''}`.trim());
    return 'undone';
  }
  if (cmd === 'summary') {
    const b = sender.defaultBrand ?? index.brands[0]?.brandKey;
    if (!b) { await deps.reply(m.from, 'No brand set up yet.'); return 'summary'; }
    const s = await deps.weekSummary(b);
    await deps.reply(m.from, `${brandName(index, b)} this week so far: sales ${formatInr(s.sales)}, costs ${formatInr(s.costs)}, ${s.count} entries.`);
    return 'summary';
  }

  // An answer to the open "Which brand?" question.
  const q = await deps.openQuestion(m.from);
  if (q) {
    const ans = parseAnswer(text, q.options, index.brands);
    if (ans) {
      await deps.closeQuestion(q.id);
      const entry = q.entryId ? await deps.getEntry(q.entryId) : null;
      if ('brandKey' in ans) {
        if (q.vendor) await deps.saveVendorRule({ vendor: q.vendor, brandKey: ans.brandKey, shared: false, splits: null, by: m.from });
        if (entry) {
          // The answer settles the brand only; an amount the rules were unsure of stays in review.
          const sure = Number(entry.meta?.confidence ?? 0) >= REVIEW_THRESHOLD;
          await deps.setEntry(entry.id, { brand_key: ans.brandKey, review_status: sure ? 'posted' : 'needs_review', tag_source: 'answer', tag_confidence: 1 });
          await deps.reply(m.from, loggedText(entry.amount_paise, entry.description ?? '', brandName(index, ans.brandKey), (entry.meta?.mode as Classified['mode']) ?? null));
        }
        return 'answered';
      }
      const brands = q.options.filter((o) => o !== 'shared');
      const pcts = 'split' in ans && ans.split.length === brands.length ? ans.split : brands.map((_, i) => (i === brands.length - 1 ? 100 - Math.floor(100 / brands.length) * (brands.length - 1) : Math.floor(100 / brands.length)));
      const splits: Split[] = brands.map((b, i) => ({ brandKey: b, pct: pcts[i] }));
      if (q.vendor) await deps.saveVendorRule({ vendor: q.vendor, brandKey: null, shared: true, splits, by: m.from });
      if (entry) {
        await deps.setEntry(entry.id, { review_status: 'rejected' });
        await deps.insertRows(splitAmount(entry.amount_paise, splits).map((p) => ({
          ...entry, id: undefined, brand_key: p.brandKey, amount_paise: p.paise, source_id: `${entry.source_id}:split:${p.brandKey}`,
          review_status: Number(entry.meta?.confidence ?? 0) >= REVIEW_THRESHOLD ? 'posted' : 'needs_review', tag_source: 'allocation', tag_confidence: 1, meta: { ...(entry.meta ?? {}), split_of: entry.id },
        } as LedgerRow)));
        await deps.reply(m.from, `Logged: ${formatInr(entry.amount_paise)} ${entry.description ?? ''} · Shared ${splits.map((s) => `${brandName(index, s.brandKey)} ${s.pct}%`).join(' / ')}`);
      }
      return 'answered';
    }
  }

  const c = classifyMessage(text, { products: [] });
  if (c.kind === 'other' || !c.amountPaise) {
    if (c.kind !== 'other') await deps.reply(m.from, 'I could not find an amount. Please resend like "paid 1200 courier upi".');
    return 'ignored';
  }

  let tag: BrandTag = detectBrand(text, index, { vendor: c.party, category: c.ledgerKind, senderDefault: sender.defaultBrand });
  if (!tag.brandKey && !tag.splits && !tag.question?.startsWith('Shared') && deps.claudeBrand) {
    const ai = await deps.claudeBrand(text);
    if (ai?.brandKey && index.brands.some((b) => b.brandKey === ai.brandKey) && ai.confidence >= TAG_THRESHOLD) {
      tag = { brandKey: ai.brandKey, splits: null, tagSource: 'claude', confidence: ai.confidence, candidates: [ai.brandKey], question: null };
    }
  }

  const base = toLedgerRow({ ...c, brandKey: tag.brandKey ?? (tag.splits ? tag.splits[0].brandKey : null) }, { at: m.at, author: sender.name, text },
    { source: 'whatsapp_api', sourceId: m.messageId, sender: m.from });
  if (!base) return 'ignored';
  let rows: LedgerRow[] = tag.splits
    ? splitAmount(c.amountPaise, tag.splits).map((p) => ({ ...base, brand_key: p.brandKey, amount_paise: p.paise, source_id: `${m.messageId}:split:${p.brandKey}` }))
    : [base];
  rows = rows.map((r) => ({ ...r, tag_source: tag.tagSource, tag_confidence: tag.confidence, ...(r.brand_key ? {} : { review_status: 'needs_review' as const }) }));
  rows = markDuplicates(rows, await deps.knownOrders(m.at));
  const inserted = await deps.insertRows(rows);

  if (!tag.brandKey && !tag.splits) {
    const options = tag.question?.startsWith('Shared') ? [...tag.candidates, 'shared'] : questionOptions(index.brands, tag.candidates);
    await deps.askQuestion({ phone: m.from, entryId: inserted[0]?.id ?? null, vendor: c.party, options });
    await deps.reply(m.from, tag.question?.startsWith('Shared') ? tag.question : brandQuestion(index.brands, tag.candidates));
    return 'asked';
  }
  if (rows.some((r) => r.review_status === 'duplicate')) {
    await deps.reply(m.from, `Looks like ${formatInr(c.amountPaise)} is already in as an online order, so I have not counted it twice.`);
    return 'needs_review';
  }
  if (rows.some((r) => r.review_status === 'needs_review')) {
    await deps.reply(m.from, `Noted ${formatInr(c.amountPaise)} for review. I will confirm once checked.`);
    return 'needs_review';
  }
  const label = tag.splits ? 'Shared ' + tag.splits.map((s) => `${brandName(index, s.brandKey)} ${s.pct}%`).join(' / ') : brandName(index, tag.brandKey);
  await deps.reply(m.from, loggedText(c.amountPaise, c.description, label, c.mode));
  return 'logged';
}

export const contentHash = (s: string) => createHash('sha256').update(s).digest('hex');
