// Import one WhatsApp group-chat export into the ledger. Re-importing the same
// file is a no-op: every row's source_id hashes group + time + author + text.
import { insertLedgerRows, serviceDb, type LedgerRow } from '../ledger';
import { detectBrand, norm, TAG_THRESHOLD, type BrandIndex } from './brand-detect';
import { loadBrandIndex } from './inbound-db';
import {
  classifyMessage, classifyWithClaude, markDuplicates, parseExport, stableSourceId, toLedgerRow, wantsFallback,
  type KnownOrder, type Product,
} from './whatsapp';

type Db = ReturnType<typeof serviceDb>;

export async function loadProducts(sb: Db): Promise<Product[]> {
  const { data, error } = await sb.from('brand_terms').select('brand_key, brand_name, whatsapp_group_names').eq('active', true);
  if (error) throw error;
  return (data ?? []).map((b: any) => ({ brandKey: b.brand_key, name: b.brand_name, groupNames: b.whatsapp_group_names ?? [] }));
}

/** Shopify / gateway orders near the given dates, for duplicate detection. */
export async function loadKnownOrders(sb: Db, fromIso: string, toIso: string): Promise<KnownOrder[]> {
  const pad = 2 * 86_400_000;
  const { data, error } = await sb.from('ledger_entries')
    .select('id, amount_paise, occurred_at')
    .eq('kind', 'order_revenue').in('source', ['shopify', 'razorpay'])
    .gte('occurred_at', new Date(Date.parse(fromIso) - pad).toISOString())
    .lte('occurred_at', new Date(Date.parse(toIso) + pad).toISOString());
  if (error) throw error;
  return (data ?? []).map((o: any) => ({ id: o.id, amount_paise: Number(o.amount_paise), occurred_at: o.occurred_at }));
}

export type ExportSender = { phone: string; name: string; defaultBrand: string | null };

/** Export authors are display names or phone numbers; match either against the allowlist. */
export function matchSender(author: string, senders: ExportSender[]): ExportSender | null {
  const digits = author.replace(/\D/g, '');
  return senders.find((s) => (digits.length >= 10 && s.phone.endsWith(digits.slice(-10))) || norm(s.name) === norm(author)) ?? null;
}

/** Pure: export messages → ledger rows, applying the allowlist and brand-detection order. */
export function exportRows(
  msgs: ReturnType<typeof parseExport>, groupName: string, index: BrandIndex, senders: ExportSender[],
  aiFor: Map<string, ReturnType<typeof classifyMessage>> = new Map(),
): { rows: LedgerRow[]; skippedSenders: number } {
  const rows: LedgerRow[] = [];
  let skippedSenders = 0;
  for (const m of msgs) {
    const sender = matchSender(m.author, senders);
    const c0 = aiFor.get(m.at + m.author + m.text) ?? classifyMessage(m.text, { products: [] });
    if (c0.kind === 'other' && !c0.amountPaise) continue;
    if (!sender) { skippedSenders++; continue; }
    let tag = detectBrand(m.text, index, { vendor: c0.party, category: c0.ledgerKind, senderDefault: sender.defaultBrand, groupName });
    if (!tag.brandKey && c0.by === 'claude' && c0.brandKey && c0.confidence >= TAG_THRESHOLD) {
      tag = { ...tag, brandKey: c0.brandKey, tagSource: 'claude', confidence: c0.confidence };
    }
    const row = toLedgerRow({ ...c0, brandKey: tag.brandKey }, m, { source: 'whatsapp', sourceId: stableSourceId(groupName, m.at, m.author, m.text), group: groupName });
    if (row) rows.push({ ...row, tag_source: tag.tagSource, tag_confidence: tag.confidence, meta: { ...row.meta, attachments: m.attachments } });
  }
  return { rows, skippedSenders };
}

export type ImportSummary = {
  skippedSenders: number;
  messages: number; money: number; posted: number; needsReview: number; duplicates: number; inserted: number;
  attachments: number; claudeUsed: number; rows: LedgerRow[];
};

export async function importWhatsAppExport(
  sb: Db,
  input: { text: string; groupName: string; anthropicApiKey?: string; dryRun?: boolean; dateOrder?: 'dmy' | 'mdy' },
): Promise<ImportSummary> {
  const products = await loadProducts(sb);
  const index = await loadBrandIndex(sb);
  const { data: senderRows, error: sErr } = await sb.from('ledger_senders').select('phone, name, default_product').eq('active', true);
  if (sErr) throw sErr;
  const senders: ExportSender[] = (senderRows ?? []).map((s: any) => ({ phone: s.phone, name: s.name, defaultBrand: s.default_product }));
  const msgs = parseExport(input.text, { dateOrder: input.dateOrder });
  let claudeUsed = 0;
  const ai = new Map<string, ReturnType<typeof classifyMessage>>();
  if (input.anthropicApiKey) {
    for (const m of msgs) {
      const c = classifyMessage(m.text, { products: [] });
      if (!matchSender(m.author, senders) || !wantsFallback(c, m.text)) continue;
      const r = await classifyWithClaude(m.text, { products, groupName: input.groupName }, input.anthropicApiKey);
      if (r) { ai.set(m.at + m.author + m.text, r); claudeUsed++; }
    }
  }
  let { rows, skippedSenders } = exportRows(msgs, input.groupName, index, senders, ai);
  if (rows.length) {
    const times = rows.map((r) => r.occurred_at).sort();
    rows = markDuplicates(rows, await loadKnownOrders(sb, times[0], times[times.length - 1]));
  }
  const inserted = input.dryRun ? 0 : await insertLedgerRows(sb, rows);
  return {
    skippedSenders,
    messages: msgs.length, money: rows.length,
    posted: rows.filter((r) => r.review_status === 'posted').length,
    needsReview: rows.filter((r) => r.review_status === 'needs_review').length,
    duplicates: rows.filter((r) => r.review_status === 'duplicate').length,
    inserted, attachments: msgs.reduce((a, m) => a + m.attachments.length, 0), claudeUsed, rows,
  };
}
