import { describe, it, expect, vi } from 'vitest';
import { createBrain, MemoryStore, EXPENSE_TAG, planMessage, sendAfter, MODEL_HIGH_STAKES, MODEL_ROUTINE, type ClaudeClient, type NotifyPort } from '../../src/lib/brain';
import { buildBody } from '../../src/lib/brain/claude';

const mockClaude = (text: string | ((u: string) => string)) => {
  const complete = vi.fn(async (req: Parameters<ClaudeClient['complete']>[0]) => ({ text: typeof text === 'function' ? text(req.user) : text, model: req.stakes === 'high' ? MODEL_HIGH_STAKES : MODEL_ROUTINE }));
  return { complete } satisfies ClaudeClient;
};

async function seeded() {
  const store = new MemoryStore();
  const deposit = await store.insertFact({ topic: 'pricing', statement: 'The only upfront payment is a ₹5,000 deposit, fully adjusted against onboarding tech costs.', source: 'public/retail-os/index.html', confidence: 1, visibility: 'public' });
  await store.upsertEntity({ kind: 'customer', name: 'Asha Rao', aliases: [], attributes: { phone: '+919800000000', order: 'deposit refund pending' }, source: 'orders:1', visibility: 'staff' });
  return { store, deposit };
}

describe('classify', () => {
  it('uses a matching rule without calling Claude', async () => {
    const store = new MemoryStore();
    const rule = await store.insertRule({ schema_name: 'expense_tag', match: { field: 'vendor', op: 'equals', value: 'Delhivery' }, outcome: 'shipping', confidence: 0.97, created_from_correction: null, created_by: 'virat', active: true });
    const claude = mockClaude('{}');
    const brain = createBrain({ store, claude });
    const r = await brain.classify({ vendor: 'Delhivery', amount: 420 }, EXPENSE_TAG);
    expect(r).toMatchObject({ answer: 'shipping', via: 'rule', why: [rule.id] });
    expect(claude.complete).not.toHaveBeenCalled();
    expect(store.ruleRows[0].hits).toBe(1);
  });

  it('falls back to retrieval + Claude when no rule matches, keeping only real evidence ids', async () => {
    const store = new MemoryStore();
    const f = await store.insertFact({ topic: 'vendor', statement: 'Shiprocket is the courier aggregator used for shipping orders.', source: 'ops:vendors', confidence: 1, visibility: 'staff' });
    const claude = mockClaude(`{"answer":"shipping","confidence":0.8,"evidence_ids":["${f.id}","made-up"]}`);
    const brain = createBrain({ store, claude });
    const r = await brain.classify({ vendor: 'Shiprocket', narration: 'courier charges' }, EXPENSE_TAG);
    expect(r).toMatchObject({ answer: 'shipping', via: 'model', why: [f.id], confidence: 0.8 });
    expect(claude.complete).toHaveBeenCalledOnce();
  });

  it('rejects labels outside the schema', async () => {
    const brain = createBrain({ store: new MemoryStore(), claude: mockClaude('{"answer":"lunch","confidence":0.9,"evidence_ids":[]}') });
    expect((await brain.classify({ vendor: 'X' }, EXPENSE_TAG)).answer).toBeNull();
  });
});

describe('learn', () => {
  it('turns a correction into a rule that wins next time and retires the wrong rule', async () => {
    const store = new MemoryStore();
    const old = await store.insertRule({ schema_name: 'expense_tag', match: { field: 'vendor', op: 'contains', value: 'meta' }, outcome: 'tech', confidence: 0.9, created_from_correction: null, created_by: 'staff', active: true });
    const claude = mockClaude('{"answer":"tech","confidence":0.5,"evidence_ids":[]}');
    const brain = createBrain({ store, claude });
    const item = { vendor: 'Meta Platforms', amount: 3000 };
    expect((await brain.classify(item, EXPENSE_TAG)).answer).toBe('tech');

    const { rule, eventId } = await brain.learn({ schema: 'expense_tag', item, wrong: 'tech', right: 'marketing', by: 'virat' });
    expect(rule).toMatchObject({ outcome: 'marketing', match: { field: 'vendor', op: 'equals', value: 'Meta Platforms' }, created_from_correction: eventId });
    expect(store.ruleRows.find((r) => r.id === old.id)).toMatchObject({ active: false, superseded_by: rule!.id });

    const again = await brain.classify(item, EXPENSE_TAG);
    expect(again).toMatchObject({ answer: 'marketing', via: 'rule', why: [rule!.id] });
    expect(claude.complete).not.toHaveBeenCalled();
    expect(store.events.some((e) => e.type === 'learn' && e.actor === 'virat')).toBe(true);
  });
});

describe('answer', () => {
  it('says "I don\'t know" and escalates to request_virat without evidence, never calling Claude', async () => {
    const { store } = await seeded();
    const claude = mockClaude('Sure, it costs ₹99.');
    const brain = createBrain({ store, claude });
    const a = await brain.answer('Do you ship to Antarctica?', { audience: { audience: 'public' } });
    expect(a.known).toBe(false);
    expect(a.answer).toMatch(/I don't know/);
    expect(a.escalate?.tool).toBe('request_virat');
    expect(claude.complete).not.toHaveBeenCalled();
  });

  it('refuses when the model answers without citing evidence', async () => {
    const { store } = await seeded();
    const brain = createBrain({ store, claude: mockClaude('The deposit is ₹10,000.') });
    const a = await brain.answer('How much is the deposit?', { audience: { audience: 'public' } });
    expect(a.known).toBe(false);
    expect(a.escalate?.tool).toBe('request_virat');
  });

  it('answers with citations, using the high-stakes model for pricing', async () => {
    const { store, deposit } = await seeded();
    const claude = mockClaude(`It's a ₹5,000 deposit, fully adjusted against tech costs [${deposit.id}].`);
    const brain = createBrain({ store, claude });
    const a = await brain.answer('How much is the deposit?', { audience: { audience: 'public' } });
    expect(a.known).toBe(true);
    expect(a.citations.map((c) => c.id)).toEqual([deposit.id]);
    expect(claude.complete.mock.calls[0][0].stakes).toBe('high');
  });

  it('keeps customer data away from public and unauthenticated staff audiences', async () => {
    const { store } = await seeded();
    const brain = createBrain({ store, claude: mockClaude('x') });
    expect(await brain.recall('Asha Rao', { audience: { audience: 'public' } })).toHaveLength(0);
    expect(await brain.recall('Asha Rao', { audience: { audience: 'staff' } })).toHaveLength(0);
    expect((await brain.recall('Asha Rao', { audience: { audience: 'staff', authenticated: true } }))[0].title).toBe('Asha Rao');
    await expect(store.upsertEntity({ kind: 'customer', name: 'B', aliases: [], attributes: {}, source: 's', visibility: 'public' })).rejects.toThrow();
  });
});

describe('decide', () => {
  const brain = createBrain({ store: new MemoryStore() });
  it('routes money to Virat', async () => {
    const d = await brain.decide({ action: 'Refund the customer', amountInr: 1200 });
    expect(d.verdict).toBe('ask Virat');
    expect(d.reasons.join(' ')).toMatch(/Money/);
  });
  it('routes pricing, legal, public claims and irreversible actions to Virat', async () => {
    for (const action of ['Change the profit pool split to 35%', 'Reply to the GST notice', 'Announce 100 brands on LinkedIn', 'Delete old order records'])
      expect((await brain.decide({ action })).verdict).toBe('ask Virat');
  });
  it('lets routine work go ahead alone', async () => {
    expect((await brain.decide({ action: 'Fix a typo on the FAQ page' })).verdict).toBe('act alone');
  });
});

describe('communicate', () => {
  // Wednesday 2026-09-23 10:00 IST = 04:30 UTC
  const wedMorning = new Date('2026-09-23T04:30:00Z');
  it('uses WhatsApp for short one-to-one messages and email for first contact, formal or record-needing ones', () => {
    const r = { name: 'Riya', phone: '+919811111111', email: 'riya@example.com' };
    expect(planMessage(r, { kind: 'order_update', timeSensitive: true }, 'Your order shipped today.', wedMorning).channel).toBe('whatsapp');
    expect(planMessage({ ...r, firstContact: true }, { kind: 'intro' }, 'Hi', wedMorning).channel).toBe('email');
    expect(planMessage(r, { kind: 'settlement_statement', needsRecord: true }, 'Statement', wedMorning).channel).toBe('email');
    expect(planMessage(r, { kind: 'terms', formal: true }, 'Terms', wedMorning).channel).toBe('email');
  });
  it('holds messages to 9am–8pm Mon–Sat in the recipient timezone, IST by default, unless urgent', () => {
    expect(sendAfter(wedMorning).toISOString()).toBe(wedMorning.toISOString());
    // Wed 21:30 IST -> Thu 09:00 IST (03:30 UTC)
    expect(sendAfter(new Date('2026-09-23T16:00:00Z')).toISOString()).toBe('2026-09-24T03:30:00.000Z');
    // Sat 22:00 IST -> Mon 09:00 IST
    expect(sendAfter(new Date('2026-09-26T16:30:00Z')).toISOString()).toBe('2026-09-28T03:30:00.000Z');
    // 07:00 in London on a Wednesday -> 09:00 London (BST, 08:00 UTC)
    expect(sendAfter(new Date('2026-09-23T06:00:00Z'), 'Europe/London').toISOString()).toBe('2026-09-23T08:00:00.000Z');
    const late = new Date('2026-09-26T17:00:00Z');
    expect(sendAfter(late, undefined, true)).toEqual(late);
  });
  it('signs as Virat, gives a stable dedupe key and hands off to notify()', async () => {
    const notify: NotifyPort = { notify: vi.fn(async () => ({ id: 'out_1', status: 'queued' as const })) };
    const brain = createBrain({ store: new MemoryStore(), notify, now: () => wedMorning });
    const r = { name: 'Riya', phone: '+919811111111' };
    const a = await brain.communicate(r, { kind: 'order_update', ref: 'ORD-9' }, 'Shipped.');
    const b = await brain.communicate(r, { kind: 'order_update', ref: 'ORD-9' }, 'Shipped!');
    expect(a.dedupeKey).toBe(b.dedupeKey);
    expect(a.from).toBe('virat');
    expect(a.body).toMatch(/— Virat$/);
    expect(notify.notify).toHaveBeenCalledTimes(2);
    expect(a.dispatched?.status).toBe('queued');
  });
});

describe('claude request', () => {
  it('caches the stable prefix and picks models by stakes', () => {
    const b = buildBody({ stakes: 'routine', stablePrefix: 'KNOW', system: 'task', user: 'q' });
    expect(b.model).toBe('claude-sonnet-5');
    expect(b.system[0]).toMatchObject({ text: 'KNOW', cache_control: { type: 'ephemeral' } });
    expect(buildBody({ stakes: 'high', stablePrefix: 'K', user: 'q' }).model).toBe('claude-opus-5-5');
  });
});
