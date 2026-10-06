import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OPERATIONS } from '../../../src/lib/intelligence/operations';
import type { OperationId } from '../../../src/lib/intelligence/operations';
import { governedMessages, ModelGateError, permitFor, resolveOperationModel, PROVIDER_CONFIGURED_MODEL_IDS } from '../../../src/lib/intelligence/provider';

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
