import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OPERATIONS } from '../../../src/lib/intelligence/operations';
import type { OperationId } from '../../../src/lib/intelligence/operations';
import { governedMessages, ModelGateError, permitFor, resolveOperationModel, onInvocation, PROVIDER_CONFIGURED_MODEL_IDS } from '../../../src/lib/intelligence/provider';
import type { InvocationRecord } from '../../../src/lib/intelligence/provider';

const ops = Object.keys(OPERATIONS) as OperationId[];

function fakeFetch(calls: { url: string; init: RequestInit }[]): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
}

describe('governed provider', () => {
  it('every registered operation is allowed and routes to a configured model', () => {
    for (const op of ops) {
      const p = permitFor({ operation: op });
      assert.equal(p.allowed, true, `${op}: ${p.reasons.join('; ')}`);
      assert.ok(PROVIDER_CONFIGURED_MODEL_IDS.includes(p.decision!.selectedModelId), op);
      assert.equal(p.grantsAuthority, false);
      assert.equal(p.attribution?.agentId, OPERATIONS[op].agentId);
    }
  });

  it('routine operations stay on Sonnet 5; high-stakes Brain stays on Opus 5.5 under its recorded standing approval', () => {
    assert.equal(resolveOperationModel('brain.routine'), 'claude-sonnet-5');
    assert.equal(resolveOperationModel('llm.classify_and_build'), 'claude-sonnet-5');
    assert.equal(resolveOperationModel('brain.high_stakes'), 'claude-opus-5-5');
  });

  it('the standing approval is the only reason the Opus call is allowed', () => {
    const spec = OPERATIONS['brain.high_stakes'];
    assert.deepEqual(spec.standingApproval, ['DS-02']);
    for (const op of ops.filter((o) => o !== 'brain.high_stakes')) assert.equal(OPERATIONS[op].standingApproval, undefined, op);
  });

  it('sends the gate-chosen model, ignoring any model in the body', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const { modelId } = await governedMessages({ operation: 'brain.routine', apiKey: 'k', fetchImpl: fakeFetch(calls), body: { model: 'claude-fable-5-1', max_tokens: 5 } });
    assert.equal(modelId, 'claude-sonnet-5');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
    const sent = JSON.parse(calls[0].init.body as string);
    assert.equal(sent.model, 'claude-sonnet-5');
    assert.equal(sent.max_tokens, 5);
  });

  it('makes no network call when the gate blocks (nothing confirmed available)', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await assert.rejects(
      governedMessages({ operation: 'brain.routine', apiKey: 'k', fetchImpl: fakeFetch(calls), body: {}, confirmedModelIds: [] }),
      (e: unknown) => e instanceof ModelGateError,
    );
    assert.equal(calls.length, 0);
  });

  it('blocks at the retry ceiling and at the invocation ceiling', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await assert.rejects(governedMessages({ operation: 'llm.classify_and_build', apiKey: 'k', fetchImpl: fakeFetch(calls), body: {}, retryCount: 3 }));
    await assert.rejects(governedMessages({ operation: 'chat.public_lead', apiKey: 'k', fetchImpl: fakeFetch(calls), body: {}, round: 20 }));
    assert.equal(calls.length, 0);
  });

  it('allows the three chat rounds', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    for (let round = 0; round < 3; round++) await governedMessages({ operation: 'chat.public_lead', round, apiKey: 'k', fetchImpl: fakeFetch(calls), body: {} });
    assert.equal(calls.length, 3);
  });

  it('Opus is blocked if the standing approval is not honoured and only Opus is configured', () => {
    const p = permitFor({ operation: 'brain.high_stakes', confirmedModelIds: ['claude-fable-5-1'] });
    assert.equal(p.allowed, false);
  });

  it('when Haiku is confirmed, a human-reviewed simple task routes down to it', () => {
    assert.equal(resolveOperationModel('ledger.classify_message', ['claude-haiku-4-5', 'claude-sonnet-5']), 'claude-haiku-4-5');
    assert.equal(resolveOperationModel('llm.classify_and_build', ['claude-haiku-4-5', 'claude-sonnet-5']), 'claude-sonnet-5');
  });
});

describe('operation profiles: least-cost sufficient model', () => {
  const withHaiku = ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5-5'];
  const expected: Record<OperationId, string> = {
    'ledger.classify_message': 'claude-haiku-4-5',
    'brain.routine': 'claude-sonnet-5',
    'llm.suggest_framework': 'claude-sonnet-5',
    'llm.estimate_hours': 'claude-sonnet-5',
    'faq.reword_answer': 'claude-sonnet-5',
    'llm.classify_and_build': 'claude-sonnet-5',
    'chat.public_lead': 'claude-sonnet-5',
    'plan.business_plan': 'claude-sonnet-5',
    'design.direction': 'claude-sonnet-5',
    'brain.high_stakes': 'claude-opus-5-5',
  };

  it('with Haiku configured, only the ledger fallback routes down to it; nothing else changes', () => {
    for (const op of ops) assert.equal(resolveOperationModel(op, withHaiku), expected[op], op);
  });

  it('with only the models in use today, every operation routes as it does in production', () => {
    for (const op of ops) assert.equal(resolveOperationModel(op), op === 'brain.high_stakes' ? 'claude-opus-5-5' : 'claude-sonnet-5', op);
  });
});

describe('attribution: what the provider actually reports', () => {
  const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

  it('records the provider usage, the model, the operation and a relative cost unit, and the caller can still read the body', async () => {
    const seen: InvocationRecord[] = [];
    const off = onInvocation((r) => seen.push(r));
    const { res, record } = await governedMessages({
      operation: 'brain.routine', apiKey: 'k', body: {},
      fetchImpl: reply({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 800 } }) as never,
    });
    assert.deepEqual(record.usage, { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 800, cacheWriteTokens: null });
    assert.equal(record.modelId, 'claude-sonnet-5');
    assert.equal(record.operation, 'brain.routine');
    assert.equal(record.agentId, 'DS-14');
    assert.equal(record.status, 200);
    assert.equal(record.costUnits, 6); // Sonnet 5 cost factor 4 x 1.5 thousand tokens: a ranking unit, not currency
    assert.deepEqual((await res.json()).content[0].text, 'hi');
    assert.equal(seen.length, 1);
    off();
    await governedMessages({ operation: 'brain.routine', apiKey: 'k', body: {}, fetchImpl: reply({}) as never });
    assert.equal(seen.length, 1);
  });

  it('reports nothing it was not told: no usage in the body means usage and cost are null, never a guess', async () => {
    const { record } = await governedMessages({ operation: 'brain.routine', apiKey: 'k', body: {}, fetchImpl: reply({ content: [] }) as never });
    assert.equal(record.usage, null);
    assert.equal(record.costUnits, null);
  });

  it('a non-JSON or error response records no usage and does not break the call', async () => {
    const odd = await governedMessages({ operation: 'brain.routine', apiKey: 'k', body: {}, fetchImpl: (async () => new Response('<html>', { status: 200 })) as never });
    assert.equal(odd.record.usage, null);
    const limited = await governedMessages({ operation: 'brain.routine', apiKey: 'k', body: {}, fetchImpl: reply({ error: 'x' }, 429) as never });
    assert.equal(limited.record.status, 429);
    assert.equal(limited.record.usage, null);
  });

  it('a network failure is recorded with its error name and still thrown to the caller', async () => {
    const seen: InvocationRecord[] = [];
    const off = onInvocation((r) => seen.push(r));
    await assert.rejects(governedMessages({ operation: 'brain.routine', apiKey: 'k', body: {}, fetchImpl: (async () => { throw new TypeError('network'); }) as never }), TypeError);
    off();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].status, 'TypeError');
    assert.equal(seen[0].usage, null);
  });

  it('a failing sink cannot break the model call', async () => {
    const off = onInvocation(() => { throw new Error('sink down'); });
    const { record } = await governedMessages({ operation: 'brain.routine', apiKey: 'k', body: {}, fetchImpl: reply({ usage: { input_tokens: 1, output_tokens: 1 } }) as never });
    off();
    assert.equal(record.usage?.inputTokens, 1);
  });

  it('the record carries the attribution hierarchy for the operation and the retry and round it ran in', async () => {
    const { record } = await governedMessages({ operation: 'chat.public_lead', round: 2, retryCount: 1, apiKey: 'k', body: {}, fetchImpl: reply({}) as never });
    assert.deepEqual(record.hierarchy.slice(0, 3), ['devshop', 'retail-os', 'DS-12']);
    assert.equal(record.round, 2);
    assert.equal(record.retryCount, 1);
  });
});
