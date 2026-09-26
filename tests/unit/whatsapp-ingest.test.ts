import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { detectBrand, parseAnswer, questionOptions, type BrandIndex } from '../../src/lib/ingest/brand-detect';
import { classifyMessage, markDuplicates, parseAmount, parseExport, stableSourceId } from '../../src/lib/ingest/whatsapp';
import { exportRows, matchSender } from '../../src/lib/ingest/whatsapp-import';
import { extractMessages, handleInbound, verifyMetaSignature, type InboundDeps } from '../../src/lib/ingest/inbound';
import type { LedgerRow } from '../../src/lib/ledger';

const index: BrandIndex = {
  brands: [
    { brandKey: 'moonglasses', name: 'Moonglasses', aliases: ['moon glasses'], keywords: ['sunglasses', 'frames'], groupNames: ['Moonglasses team'] },
    { brandKey: 'travaholic', name: 'Travaholic', keywords: ['caps'], groupNames: [] },
  ],
  vendors: [{ vendor: 'Ravi Prints', brandKey: 'travaholic', shared: false }],
  allocations: [{ matchType: 'vendor', matchValue: 'Office Rent', splits: [{ brandKey: 'moonglasses', pct: 50 }, { brandKey: 'travaholic', pct: 50 }] }],
};

describe('export formats', () => {
  it('parses Android exports (multi-line, media)', () => {
    const txt = '12/09/2026, 10:15 am - Ravi: paid ₹1,200 courier upi\nfor 3 parcels\n12/09/2026, 10:16 am - Ravi: IMG-001.jpg (file attached)\n12/09/2026, 10:17 am - Messages and calls are end-to-end encrypted';
    const m = parseExport(txt);
    expect(m.length).toBe(2);
    expect(m[0]).toMatchObject({ author: 'Ravi', text: 'paid ₹1,200 courier upi\nfor 3 parcels', at: '2026-09-12T04:45:00.000Z' });
    expect(m[1].attachments).toEqual(['IMG-001.jpg']);
  });
  it('parses iOS exports', () => {
    const m = parseExport('[12/09/26, 10:15:30 PM] Asha: sold sunglasses 2.5k cash\n[13/09/26, 9:00:00 AM] Asha: ‎<attached: 00001-PHOTO.jpg>');
    expect(m[0]).toMatchObject({ author: 'Asha', at: '2026-09-12T16:45:30.000Z' });
    expect(m[1].attachments).toEqual(['00001-PHOTO.jpg']);
  });
  it('reads ₹, rs, k and lakh', () => {
    expect(parseAmount('paid ₹1,200')!.paise).toBe(120000);
    expect(parseAmount('rs 450 packing')!.paise).toBe(45000);
    expect(parseAmount('ads 2.5k')!.paise).toBe(250000);
    expect(parseAmount('rent 1.5 lakh')!.paise).toBe(15_000_000);
  });
  it('classifies kind, mode and payer', () => {
    expect(classifyMessage('paid 1200 courier upi to Delhivery', { products: [] })).toMatchObject({ kind: 'expense', ledgerKind: 'shipping', mode: 'upi', party: 'Delhivery' });
    expect(classifyMessage('sold 2 caps 1800 cash', { products: [] })).toMatchObject({ kind: 'sale', mode: 'cash' });
    expect(classifyMessage('refunded 500 to customer card', { products: [] })).toMatchObject({ kind: 'refund', mode: 'card' });
    expect(classifyMessage('good morning', { products: [] }).kind).toBe('other');
  });
});

describe('brand detection order', () => {
  it('1 brand named in text, with typos, beats keywords', () => {
    expect(detectBrand('paid 500 moonglases courier', index)).toMatchObject({ brandKey: 'moonglasses', tagSource: 'text_alias' });
    expect(detectBrand('Moonglasses caps sample 200', index).tagSource).toBe('text_alias');
  });
  it('2 product keywords', () => {
    expect(detectBrand('bought caps 2k', index)).toMatchObject({ brandKey: 'travaholic', tagSource: 'keyword' });
    expect(detectBrand('frames stock 5k', index)).toMatchObject({ brandKey: 'moonglasses', tagSource: 'keyword' });
  });
  it('3 vendor rule, 4 sender default, 5 group name', () => {
    expect(detectBrand('paid 900', index, { vendor: 'ravi prints', senderDefault: 'moonglasses' }).tagSource).toBe('vendor_memory');
    expect(detectBrand('paid 900', index, { senderDefault: 'moonglasses', groupName: 'Travaholic' }).tagSource).toBe('sender_default');
    expect(detectBrand('paid 900', index, { groupName: 'Moonglasses team' })).toMatchObject({ brandKey: 'moonglasses', tagSource: 'group_name' });
  });
  it('6 unknown asks one question; the answer parses', () => {
    const t = detectBrand('paid 900', index);
    expect(t.question).toBe('Which brand? 1 Moonglasses 2 Travaholic 3 Shared');
    const opts = questionOptions(index.brands, t.candidates);
    expect(parseAnswer('2', opts, index.brands)).toEqual({ brandKey: 'travaholic' });
    expect(parseAnswer('3', opts, index.brands)).toEqual({ shared: true });
  });
  it('shared cost uses the allocation rule', () => {
    expect(detectBrand('shared office rent 20000', index, { vendor: 'Office Rent' })).toMatchObject({ tagSource: 'allocation', splits: [{ brandKey: 'moonglasses', pct: 50 }, { brandKey: 'travaholic', pct: 50 }] });
  });
});

describe('export import: allowlist, tag_source, idempotency', () => {
  const senders = [{ phone: '919800000001', name: 'Ravi', defaultBrand: 'moonglasses' }];
  it('only allowlisted authors write; every row has tag_source', () => {
    const msgs = parseExport('12/09/2026, 10:15 am - Ravi: paid ₹1,200 courier upi\n12/09/2026, 10:16 am - Stranger: paid ₹900 courier');
    const { rows, skippedSenders } = exportRows(msgs, 'Ops', index, senders);
    expect(skippedSenders).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ brand_key: 'moonglasses', tag_source: 'sender_default', review_status: 'posted' });
    expect(matchSender('+91 98000 00001', senders)?.name).toBe('Ravi');
  });
  it('same message, same source id', () => {
    expect(stableSourceId('g', 't', 'a', 'x')).toBe(stableSourceId('g', 't', 'a', 'x'));
  });
  it('ad hoc sale matching an online order ±1 day is a duplicate', () => {
    const row = { kind: 'order_revenue', amount_paise: 180000, occurred_at: '2026-09-12T10:00:00Z', source: 'whatsapp', source_id: 'a', meta: {} } as unknown as LedgerRow;
    expect(markDuplicates([row], [{ id: 'o1', amount_paise: 180000, occurred_at: '2026-09-13T08:00:00Z' }])[0].review_status).toBe('duplicate');
    expect(markDuplicates([row], [{ id: 'o1', amount_paise: 180000, occurred_at: '2026-09-15T08:00:00Z' }])[0].review_status).toBeUndefined();
  });
});

describe('Meta signature', () => {
  it('accepts a correct X-Hub-Signature-256 and rejects anything else', () => {
    const body = '{"a":1}';
    const sig = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
    expect(verifyMetaSignature(body, sig, 'secret')).toBe(true);
    expect(verifyMetaSignature(body + ' ', sig, 'secret')).toBe(false);
    expect(verifyMetaSignature(body, sig, 'other')).toBe(false);
    expect(verifyMetaSignature(body, null, 'secret')).toBe(false);
    expect(verifyMetaSignature(body, sig, '')).toBe(false);
  });
  it('extracts messages from a Cloud API payload', () => {
    const m = extractMessages({ entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1', from: '9198', timestamp: '1790000000', text: { body: 'hi' } }] } }] }] });
    expect(m[0]).toMatchObject({ messageId: 'wamid.1', from: '9198', text: 'hi' });
  });
});

function fakeDeps(over: Partial<InboundDeps> = {}) {
  const seen = new Set<string>();
  const rows: (LedgerRow & { id: string })[] = [];
  const replies: string[] = [];
  let q: any = null;
  const rules: any[] = [];
  const deps: InboundDeps = {
    markSeen: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    findSender: async (p) => (p === '919800000001' ? { phone: p, name: 'Ravi', defaultBrand: null, role: 'logger' } : null),
    loadIndex: async () => index,
    openQuestion: async () => q,
    askQuestion: async (x) => { q = { id: 'q1', ...x }; },
    closeQuestion: async () => { q = null; },
    saveVendorRule: async (r) => { rules.push(r); },
    insertRows: async (rs) => rs.map((r) => { const row = { ...r, id: `r${rows.length + 1}` }; rows.push(row); return { id: row.id, source_id: r.source_id }; }),
    getEntry: async (id) => rows.find((r) => r.id === id) ?? null,
    setEntry: async (id, p) => { Object.assign(rows.find((r) => r.id === id)!, p); },
    lastEntry: async () => [...rows].reverse().find((r) => r.review_status !== 'rejected') ?? null,
    weekSummary: async () => ({ sales: 180000, costs: 120000, count: 2 }),
    knownOrders: async () => [],
    reply: async (_to, t) => { replies.push(t); },
    toLead: vi.fn(async () => {}),
    ...over,
  };
  return { deps, rows, replies, rules };
}
const msg = (id: string, text: string, from = '919800000001') => ({ messageId: id, from, text, at: '2026-09-22T06:00:00Z' });

describe('inbound WhatsApp', () => {
  it('unknown senders never touch the ledger', async () => {
    const f = fakeDeps();
    expect(await handleInbound(msg('m1', 'paid 500 caps', '911111111111'), f.deps)).toBe('not_allowlisted');
    expect(f.rows).toHaveLength(0);
    expect(f.deps.toLead).toHaveBeenCalled();
  });
  it('logs and replies in the agreed format; the same message id twice is a no-op', async () => {
    const f = fakeDeps();
    expect(await handleInbound(msg('m2', 'paid ₹1,200 caps courier upi'), f.deps)).toBe('logged');
    expect(f.replies[0]).toBe('Logged: ₹1,200 paid caps courier upi · Travaholic · UPI');
    expect(f.rows[0]).toMatchObject({ tag_source: 'keyword', review_status: 'posted', brand_key: 'travaholic' });
    expect(await handleInbound(msg('m2', 'paid ₹1,200 caps courier upi'), f.deps)).toBe('duplicate');
    expect(f.rows).toHaveLength(1);
  });
  it('asks once when unsure, saves the answer as a vendor rule', async () => {
    const f = fakeDeps();
    expect(await handleInbound(msg('m3', 'paid ₹900 to Kumar Packers cash'), f.deps)).toBe('asked');
    expect(f.replies[0]).toBe('Which brand? 1 Moonglasses 2 Travaholic 3 Shared');
    expect(f.rows[0].review_status).toBe('needs_review');
    expect(await handleInbound(msg('m4', '1'), f.deps)).toBe('answered');
    expect(f.rows[0]).toMatchObject({ brand_key: 'moonglasses', review_status: 'posted', tag_source: 'answer' });
    expect(f.rules[0]).toMatchObject({ vendor: 'Kumar Packers', brandKey: 'moonglasses' });
  });
  it('uses Claude only after the rules, and only when confident', async () => {
    const f = fakeDeps({ claudeBrand: async () => ({ brandKey: 'moonglasses', confidence: 0.85 }) });
    expect(await handleInbound(msg('m5', 'paid ₹900 to Kumar Packers cash'), f.deps)).toBe('logged');
    expect(f.rows[0].tag_source).toBe('claude');
    const g = fakeDeps({ claudeBrand: async () => ({ brandKey: 'moonglasses', confidence: 0.5 }) });
    expect(await handleInbound(msg('m6', 'paid ₹900 to Kumar Packers cash'), g.deps)).toBe('asked');
  });
  it('undo and summary', async () => {
    const f = fakeDeps();
    await handleInbound(msg('m7', 'paid 300 caps cash'), f.deps);
    expect(await handleInbound(msg('m8', 'undo'), f.deps)).toBe('undone');
    expect(f.rows[0].review_status).toBe('rejected');
    expect(await handleInbound(msg('m9', 'summary'), f.deps)).toBe('summary');
    expect(f.replies.at(-1)).toContain('sales ₹1,800');
  });
});
