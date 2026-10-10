import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryWorkRegistry } from '../work/registry';
import { Scopes } from '../work/scope';
import { VIRAT } from '../work/actors';
import type { Actor } from '../work/types';
import { classifyFounderInput } from './founder-input';
import { processFounderInput } from './orchestrator';
import { ROLE_BINDINGS, functionForText } from './roles';
import {
  matchFunction, assignSpecialist, specialistForBrand,
  validateBrandIsolation, availableSpecialists, FUNCTIONAL_DOMAINS,
  type ScopedAssignment,
} from './specialist-pool';

const now = new Date('2026-10-10T09:00:00Z');
const reg = () => new InMemoryWorkRegistry();
const run = (r: InMemoryWorkRegistry, text: string, opts: Parameters<typeof classifyFounderInput>[2] = {}) =>
  processFounderInput(classifyFounderInput(text, VIRAT, { now, ...opts }), r, { now });

// ── specialist-pool.ts unit tests ────────────────────────────────────────

describe('Specialist pool: function matching', () => {
  it('matches growth keywords', () => {
    assert.equal(matchFunction('Launch the new campaign on social'), 'growth');
    assert.equal(matchFunction('Post a reel for Moon'), 'growth');
  });

  it('matches quality keywords', () => {
    assert.equal(matchFunction('Run the health check on all brands'), 'quality');
    assert.equal(matchFunction('Audit the Moon checkout links'), 'quality');
  });

  it('matches sales keywords', () => {
    assert.equal(matchFunction('Send the NDA to the new lead'), 'sales');
    assert.equal(matchFunction('Update the proposal for Ceremony'), 'sales');
  });

  it('matches finance keywords', () => {
    assert.equal(matchFunction('Generate the monthly invoice'), 'finance');
    assert.equal(matchFunction('Check the P&L for Moon'), 'finance');
  });

  it('matches customer care keywords', () => {
    assert.equal(matchFunction('Handle the customer care complaint'), 'customer_care');
    assert.equal(matchFunction('Check the WhatsApp inbox'), 'customer_care');
  });

  it('returns null for unmatched text', () => {
    assert.equal(matchFunction('Hello world'), null);
  });
});

describe('Specialist pool: scoped assignment', () => {
  it('assigns Grow to a Moon growth task', () => {
    const a = specialistForBrand('growth', 'moonglasses')!;
    assert.equal(a.specialistId, 'DS-11');
    assert.equal(a.specialistName, 'Grow');
    assert.equal(a.brandScope.brand, 'moonglasses');
    assert.equal(a.brandCeoId, 'MG-01');
  });

  it('assigns the same Grow to a Travaholic growth task', () => {
    const a = specialistForBrand('growth', 'caps')!;
    assert.equal(a.specialistId, 'DS-11');
    assert.equal(a.brandScope.brand, 'caps');
    assert.equal(a.brandCeoId, 'TC-01');
  });

  it('same specialist, different brand scopes — no duplication', () => {
    const moon = specialistForBrand('growth', 'moonglasses')!;
    const trav = specialistForBrand('growth', 'caps')!;
    assert.equal(moon.specialistId, trav.specialistId);
    assert.notEqual(moon.brandScope.brand, trav.brandScope.brand);
  });

  it('validates brand isolation: rejects brand scope without brand key', () => {
    const a = assignSpecialist('growth', null, { kind: 'brand', brand: null, founder: null, system: null, extension: null });
    const v = validateBrandIsolation(a, []);
    assert.equal(v.isolated, false);
  });

  it('validates brand isolation: accepts proper brand scope', () => {
    const a = specialistForBrand('growth', 'moonglasses')!;
    const v = validateBrandIsolation(a, []);
    assert.equal(v.isolated, true);
  });
});

describe('Specialist pool: all domains available', () => {
  it('has 8 functional domains', () => {
    assert.equal(FUNCTIONAL_DOMAINS.length, 8);
  });

  it('all specialists are available', () => {
    assert.equal(availableSpecialists().length, 8);
  });
});

// ── roles.ts integration ─────────────────────────────────────────────────

describe('Roles: specialist function detection', () => {
  it('detects growth function when Grow is named explicitly', () => {
    assert.equal(functionForText('Grow should run a campaign for Moon'), 'growth');
  });

  it('detects quality function when Check is named', () => {
    assert.equal(functionForText('Check: audit the checkout links'), 'quality');
  });

  it('detects sales function when Deal is named', () => {
    assert.equal(functionForText('[to Deal] send the NDA to the lead'), 'sales');
  });

  it('detects finance by agent ID', () => {
    assert.equal(functionForText('DS-13 should generate the P&L'), 'finance');
  });

  it('deployment still takes priority over specialist', () => {
    assert.equal(functionForText('Deploy the growth page to production'), 'technical_deployment');
  });

  it('returns null for non-specialist text', () => {
    assert.equal(functionForText('Hello how are you'), null);
  });

  it('generic brand work does not route to a specialist', () => {
    assert.equal(functionForText('Fix the Moon checkout page'), null);
  });
});

// ── Orchestrator integration: shared specialist routing ──────────────────

describe('Orchestrator: shared specialist routing', () => {
  it('routes growth work to Grow (DS-11) when explicitly named, without approval gate', () => {
    const r = reg();
    const out = run(r, 'Create a content campaign — Grow should handle it for Moon', { brand: 'moonglasses' });
    assert.equal(out.kind, 'work_created');
    assert.equal(out.routing?.function, 'growth');
    assert.equal(out.routing?.role, 'growth_specialist');
    assert.equal(out.escalationRequired, false);
    const item = r.list()[0];
    assert.equal(item.owner?.id, 'DS-11');
  });

  it('routes quality work to Check (DS-10) when explicitly named', () => {
    const r = reg();
    const out = run(r, 'Check: handle the Moon product page link audit', { brand: 'moonglasses' });
    assert.equal(out.routing?.function, 'quality');
    assert.equal(out.routing?.role, 'quality_specialist');
    assert.equal(out.escalationRequired, false);
  });

  it('routes finance work to Books by agent ID', () => {
    const r = reg();
    const out = run(r, 'Create the P&L for Travaholic — DS-13 handles this', { brand: 'caps' });
    assert.equal(out.routing?.function, 'finance');
    assert.equal(out.routing?.role, 'finance_specialist');
  });

  it('deployment work still requires Virat approval (human holder)', () => {
    const r = reg();
    const out = run(r, 'Deploy the DNS changes to production');
    assert.equal(out.routing?.function, 'technical_deployment');
    assert.equal(out.escalationRequired, true);
  });

  it('Grow operates on Moon and Trav independently — same specialist, separate work items', () => {
    const r = reg();
    const moonOut = run(r, 'Post a reel for Moon — Grow handles it', { brand: 'moonglasses' });
    const travOut = run(r, 'Post a reel for Trav — Grow handles it', { brand: 'caps' });
    assert.equal(moonOut.routing?.function, 'growth');
    assert.equal(travOut.routing?.function, 'growth');
    const items = r.list();
    assert.equal(items.length, 2);
    const moonItem = items.find(i => i.scope.brand === 'moonglasses')!;
    const travItem = items.find(i => i.scope.brand === 'caps')!;
    assert.equal(moonItem.owner?.id, 'DS-11');
    assert.equal(travItem.owner?.id, 'DS-11');
    assert.notEqual(moonItem.id, travItem.id);
  });

  it('brand scope is preserved — no cross-brand data leakage', () => {
    const r = reg();
    run(r, 'Launch campaign for Moon — Grow handles it', { brand: 'moonglasses' });
    run(r, 'Launch campaign for Trav — Grow handles it', { brand: 'caps' });
    const items = r.list();
    assert.equal(items.length, 2);
    const moonItem = items.find(i => i.scope.brand === 'moonglasses')!;
    const travItem = items.find(i => i.scope.brand === 'caps')!;
    assert.equal(moonItem.scope.brand, 'moonglasses');
    assert.equal(travItem.scope.brand, 'caps');
    assert.notEqual(moonItem.scope.brand, travItem.scope.brand);
  });

  it('generic brand work goes to the brand CEO, not a specialist', () => {
    const r = reg();
    const out = run(r, 'Fix the Moon checkout page', { brand: 'moonglasses' });
    assert.equal(out.routing, null);
    assert.equal(out.workItem?.owner?.id, 'MG-01');
  });
});
