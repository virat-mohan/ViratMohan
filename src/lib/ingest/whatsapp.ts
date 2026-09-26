// WhatsApp → ledger. Pure parsing and classification, shared by the group-chat
// export importer and the Cloud API webhook.
//   parseExport     Android and iOS .txt exports, multi-line messages, media lines
//   classifyMessage rules first: kind, amount (₹ / rs / k / lakh), mode, who, product
//   classifyWithClaude optional fallback for messages the rules can't read
//   toLedgerRow     stable source_id, needs_review for anything uncertain
//   markDuplicates  an ad hoc sale that matches a Shopify / gateway order is a duplicate
// Receipt images are recorded (attachments) but not read yet: OCR is a follow-up.
import { createHash } from 'node:crypto';
import { accountsFor, type LedgerRow } from '../ledger';
import type { EntryKind } from '../settlement';

export type WaMessage = { at: string; author: string; text: string; attachments: string[] };

export type Kind = 'expense' | 'sale' | 'refund' | 'other';
export type Mode = 'cash' | 'upi' | 'card' | 'bank' | null;
export type Product = { brandKey: string; name: string; groupNames?: string[] };

export type Classified = {
  kind: Kind;
  ledgerKind: EntryKind | null;
  amountPaise: number | null;
  description: string;
  party: string | null;
  mode: Mode;
  brandKey: string | null;
  confidence: number; // 0–1
  by: 'rules' | 'claude';
};

export const REVIEW_THRESHOLD = 0.8;

// ── Parse ───────────────────────────────────────────────────────────────────
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const SPACES = /[   ]/g;
const TS = String.raw`(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([aApP]\.?\s?[mM]\.?)?`;
const IOS = new RegExp(String.raw`^\[${TS}\]\s*(.*)$`);
const ANDROID = new RegExp(String.raw`^${TS}\s+-\s+(.*)$`);
const MEDIA = [
  /<attached:\s*([^>]+)>/i, // iOS
  /^(\S+\.(?:jpe?g|png|webp|pdf|heic|mp4|opus|ogg))\s*\(file attached\)/i, // Android
  /^<Media omitted>$/i, /^(image|video|document|audio|sticker|GIF) omitted$/i,
];

type Raw = { d: number; m: number; y: number; hh: number; mm: number; ss: number; ampm: string | undefined; rest: string };

export function parseExport(text: string, opts: { dateOrder?: 'dmy' | 'mdy' } = {}): WaMessage[] {
  const raws: Raw[] = [];
  for (const line0 of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = line0.replace(INVISIBLE, '').replace(SPACES, ' ');
    const m = IOS.exec(line) || ANDROID.exec(line);
    if (m) {
      raws.push({ d: +m[1], m: +m[2], y: +m[3], hh: +m[4], mm: +m[5], ss: m[6] ? +m[6] : 0, ampm: m[7], rest: m[8] });
    } else if (raws.length) {
      raws[raws.length - 1].rest += '\n' + line; // continuation of a multi-line message
    }
  }
  // Day/month order: detect from the file, default to India's day-first.
  let order = opts.dateOrder;
  if (!order) order = raws.some((r) => r.m > 12) ? 'mdy' : 'dmy';
  const out: WaMessage[] = [];
  for (const r of raws) {
    const colon = r.rest.indexOf(': ');
    if (colon <= 0) continue; // system line ("Messages are end-to-end encrypted", joins, etc.)
    const author = r.rest.slice(0, colon).trim();
    let body = r.rest.slice(colon + 2).trim();
    const attachments: string[] = [];
    body = body.split('\n').filter((l) => {
      const t = l.trim();
      for (const re of MEDIA) { const mm = re.exec(t); if (mm) { attachments.push(mm[1] && !/omitted/i.test(t) ? mm[1].trim() : t); return !!t.replace(re, '').trim(); } }
      return true;
    }).map((l) => l.replace(MEDIA[0], '').trim()).join('\n').trim();
    const [day, month] = order === 'dmy' ? [r.d, r.m] : [r.m, r.d];
    const year = r.y < 100 ? 2000 + r.y : r.y;
    let hh = r.hh;
    if (r.ampm) { const pm = /p/i.test(r.ampm); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
    const p = (n: number) => String(n).padStart(2, '0');
    const at = new Date(`${year}-${p(month)}-${p(day)}T${p(hh)}:${p(r.mm)}:${p(r.ss)}+05:30`).toISOString();
    out.push({ at, author, text: body, attachments });
  }
  return out;
}

// ── Classify (rules) ────────────────────────────────────────────────────────
const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5 };
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;
const UNIT = String.raw`(k|thousand|lakhs?|lacs?|l)?`;
const MARKED = [
  new RegExp(String.raw`(?:₹|\brs\.?|\binr)\s*${NUM}\s*${UNIT}\b`, 'i'),
  new RegExp(String.raw`${NUM}\s*(k|thousand|lakhs?|lacs?)\b`, 'i'),
  new RegExp(String.raw`${NUM}\s*()(?:rs\b\.?|rupees|\/-|₹)`, 'i'),
];
const BARE = /(?<![#\w.])(\d[\d,]*(?:\.\d+)?)(?![\w%])/;

export function parseAmount(text: string): { paise: number; marked: boolean; match: string } | null {
  for (const re of MARKED) {
    const m = re.exec(text);
    if (m) return { paise: toPaise(m[1], m[2]), marked: true, match: m[0] };
  }
  const b = BARE.exec(text);
  if (b) {
    const digits = b[1].replace(/[,.]/g, '');
    if (digits.length >= 8) return null; // phone numbers, ids
    return { paise: toPaise(b[1], ''), marked: false, match: b[0] };
  }
  return null;
}
function toPaise(num: string, unit: string | undefined): number {
  const n = parseFloat(num.replace(/,/g, ''));
  return Math.round(n * (MULT[(unit || '').toLowerCase()] ?? 1) * 100);
}

const RE = {
  refund: /\b(refund(?:ed|s)?|returned money|money back)\b/i,
  sale: /\b(sold|sale|sales|order received|received|collected|customer paid|got paid|payment from)\b/i,
  expense: /\b(paid|pay|spent|spend|bought|buy|purchased?|expenses?|courier|shipping|delivery|shiprocket|packaging|packing|ads?|boost(?:ed)?|rent|salary|transport|fuel|petrol|printing|print|fabric|material|stock)\b/i,
};
const EXPENSE_KIND: [RegExp, EntryKind][] = [
  [/\b(courier|shipping|delivery|shiprocket|delhivery|dtdc|blue ?dart|porter|dunzo)\b/i, 'shipping'],
  [/\b(ads?|boost(?:ed)?|meta|facebook|instagram|google ads|campaign)\b/i, 'ad_spend'],
  [/\b(packaging|packing|boxes|fabric|material|stock|inventory|raw)\b/i, 'product_cost'],
];

function modeOf(text: string): Mode {
  if (/\bcash\b/i.test(text)) return 'cash';
  if (/\b(upi|gpay|g ?pay|google pay|phone ?pe|paytm|bhim)\b/i.test(text)) return 'upi';
  if (/\b(card|credit card|debit card|swipe)\b/i.test(text)) return 'card';
  if (/\b(neft|imps|rtgs|bank transfer)\b/i.test(text)) return 'bank';
  return null;
}

function partyOf(text: string): string | null {
  const m = /\b(?:to|from|by)\s+([A-Z][\w.]*(?:\s+[A-Z][\w.]*)?)/.exec(text);
  return m ? m[1] : null;
}

export function productFor(products: Product[], groupName: string | null, text = ''): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const g = groupName ? norm(groupName) : '';
  if (g) {
    const hits = products.filter((p) => (p.groupNames ?? []).some((n) => norm(n) === g) || g.includes(norm(p.name)));
    if (hits.length === 1) return hits[0].brandKey;
    if (hits.length > 1) return null;
  }
  const t = ` ${norm(text)} `;
  const named = products.filter((p) => t.includes(` ${norm(p.name)} `));
  return named.length === 1 ? named[0].brandKey : null;
}

export function classifyMessage(text: string, ctx: { products: Product[]; groupName?: string | null; defaultBrandKey?: string | null }): Classified {
  const amt = parseAmount(text);
  const hits = (['refund', 'sale', 'expense'] as const).filter((k) => RE[k].test(text));
  // Refund wins over sale/expense words; "customer paid" / "received" beats a bare "paid".
  let kind: Kind = 'other';
  if (hits.includes('refund')) kind = 'refund';
  else if (hits.includes('sale')) kind = 'sale';
  else if (hits.includes('expense')) kind = 'expense';

  let ledgerKind: EntryKind | null = null;
  if (kind === 'sale') ledgerKind = 'order_revenue';
  else if (kind === 'refund') ledgerKind = 'refund';
  else if (kind === 'expense') ledgerKind = EXPENSE_KIND.find(([re]) => re.test(text))?.[1] ?? 'expense';

  let confidence = 0.3;
  if (kind !== 'other' && amt) confidence = amt.marked ? 0.9 : 0.7;
  if (kind !== 'other' && !amt) confidence = 0.5;
  if (hits.length > 1 && !(hits.length === 2 && hits.includes('refund'))) confidence = Math.min(confidence, 0.7);

  const brandKey = productFor(ctx.products, ctx.groupName ?? null, text) ?? ctx.defaultBrandKey ?? null;
  const description = (amt ? text.replace(amt.match, ' ') : text).replace(/\s+/g, ' ').trim().slice(0, 140);
  return { kind, ledgerKind, amountPaise: amt?.paise ?? null, description, party: partyOf(text), mode: modeOf(text), brandKey, confidence, by: 'rules' };
}

export function needsReview(c: Classified): boolean {
  return c.confidence < REVIEW_THRESHOLD || !c.amountPaise || !c.brandKey || c.kind === 'other';
}

/** Worth a Claude look: rules found money-ish text but could not read it with confidence. */
export function wantsFallback(c: Classified, text: string): boolean {
  return (c.kind === 'other' && /\d/.test(text)) || (c.kind !== 'other' && c.confidence < REVIEW_THRESHOLD);
}

// ── Classify (Claude fallback, optional) ────────────────────────────────────
export async function classifyWithClaude(
  text: string,
  ctx: { products: Product[]; groupName?: string | null; defaultBrandKey?: string | null },
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Classified | null> {
  const productNames = ctx.products.map((p) => `${p.brandKey} (${p.name})`).join(', ') || 'none';
  const prompt = `Read one WhatsApp message from a small Indian business's expenses/sales chat and return JSON only:
{"kind":"expense|sale|refund|other","category":"shipping|ad_spend|product_cost|expense|null","amount_inr":number|null,"mode":"cash|upi|card|bank|null","party":string|null,"product":string|null,"description":string,"confidence":0-1}
Rules: never guess an amount that is not written. "k" = thousand, "lakh" = 100000. product must be one of: ${productNames}, or null.
Group: ${ctx.groupName ?? 'direct message'}
Message: ${text}`;
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const raw = data.content?.find((c) => c.type === 'text')?.text ?? '';
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const kind: Kind = ['expense', 'sale', 'refund'].includes(j.kind) ? j.kind : 'other';
    const cat = ['shipping', 'ad_spend', 'product_cost', 'expense'].includes(j.category) ? (j.category as EntryKind) : 'expense';
    const ledgerKind: EntryKind | null = kind === 'sale' ? 'order_revenue' : kind === 'refund' ? 'refund' : kind === 'expense' ? cat : null;
    const brandKey = ctx.products.find((p) => p.brandKey === j.product || p.name === j.product)?.brandKey ?? productFor(ctx.products, ctx.groupName ?? null, text) ?? ctx.defaultBrandKey ?? null;
    const amount = typeof j.amount_inr === 'number' && j.amount_inr > 0 ? Math.round(j.amount_inr * 100) : null;
    return {
      kind, ledgerKind, amountPaise: amount, description: String(j.description || text).slice(0, 140),
      party: j.party || null, mode: ['cash', 'upi', 'card', 'bank'].includes(j.mode) ? j.mode : null, brandKey,
      // Model output is never trusted above the review bar on its own say-so alone.
      confidence: Math.min(Number(j.confidence) || 0, 0.85), by: 'claude',
    };
  } catch {
    return null;
  }
}

// ── Ledger rows ─────────────────────────────────────────────────────────────
export function stableSourceId(group: string, at: string, author: string, text: string): string {
  return createHash('sha256').update([group, at, author, text].join('␟')).digest('hex');
}

export function toLedgerRow(
  c: Classified,
  msg: { at: string; author: string; text: string },
  opts: { source: 'whatsapp' | 'whatsapp_api'; sourceId: string; group?: string | null; sender?: string | null },
): LedgerRow | null {
  if (c.kind === 'other' && !c.amountPaise) return null; // chatter, not money
  const ledgerKind = c.ledgerKind ?? 'expense';
  const review = needsReview(c);
  return {
    brand_key: c.brandKey, // null → review queue until a product is chosen
    kind: ledgerKind,
    amount_paise: c.amountPaise ?? 0,
    ...accountsFor(ledgerKind),
    occurred_at: msg.at,
    order_id: null,
    source: opts.source,
    source_id: opts.sourceId,
    description: c.description || null,
    meta: {
      author: msg.author, sender: opts.sender ?? null, group: opts.group ?? null, text: msg.text.slice(0, 1000),
      party: c.party, mode: c.mode, classified_by: c.by, confidence: c.confidence, wa_kind: c.kind,
      ...(ledgerKind === 'order_revenue' ? { payment: 'offline' } : {}),
    },
    review_status: review ? 'needs_review' : 'posted',
  };
}

// ── Double counting ─────────────────────────────────────────────────────────
export type KnownOrder = { id: string; amount_paise: number; occurred_at: string };

const istDate = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${istDate(a)}T00:00:00Z`) - Date.parse(`${istDate(b)}T00:00:00Z`)) / 86_400_000;

/**
 * An ad hoc WhatsApp sale with the same amount as a Shopify / gateway order
 * within ±1 day is the same sale told twice: mark it duplicate so it is never
 * counted. Each order absorbs at most one WhatsApp sale.
 */
export function markDuplicates(rows: LedgerRow[], orders: KnownOrder[]): LedgerRow[] {
  const used = new Set<string>();
  return rows.map((r) => {
    if (r.kind !== 'order_revenue' || !r.source.startsWith('whatsapp')) return r;
    const hit = orders.find((o) => !used.has(o.id) && o.amount_paise === r.amount_paise && dayDiff(o.occurred_at, r.occurred_at) <= 1);
    if (!hit) return r;
    used.add(hit.id);
    return { ...r, review_status: 'duplicate', meta: { ...(r.meta ?? {}), duplicate_of: hit.id } };
  });
}

export const formatInr = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
