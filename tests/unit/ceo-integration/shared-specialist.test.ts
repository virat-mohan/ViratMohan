// Phase 5: Shared specialist operational — Grow (DS-11) across Moon and Travaholic
// End-to-end: create brand-scoped work, assign to specialist, verify isolation, report to CEO
import { describe, it, expect } from 'vitest';
import { InMemoryWorkRegistry } from '../../../src/lib/work/registry';
import { VIRAT } from '../../../src/lib/work/actors';
import { Scopes } from '../../../src/lib/work/scope';
import { CEO } from '../../../src/lib/ceo/types';
import { classifyFounderInput } from '../../../src/lib/ceo/founder-input';
import { processFounderInput } from '../../../src/lib/ceo/orchestrator';
import {
  specialistForBrand, validateBrandIsolation, matchFunction, availableSpecialists,
} from '../../../src/lib/ceo/specialist-pool';
import { checkCollisions } from '../../../src/lib/ceo/parallel-work';

const now = new Date('2026-10-10T10:00:00Z');
const reg = () => new InMemoryWorkRegistry();
const run = (r: InMemoryWorkRegistry, text: string, opts: Parameters<typeof classifyFounderInput>[2] = {}) =>
  processFounderInput(classifyFounderInput(text, VIRAT, { now, ...opts }), r, { now });

describe('Phase 5: Grow operating across Moon and Travaholic', () => {
  it('Grow receives brand-scoped work for Moon', () => {
    const r = reg();
    const out = run(r, 'Create a reel campaign — Grow should handle it for Moon', { brand: 'moonglasses' });
    expect(out.kind).toBe('work_created');
    expect(out.routing?.function).toBe('growth');
    expect(out.workItem?.owner?.id).toBe('DS-11');
    expect(out.workItem?.scope.brand).toBe('moonglasses');
  });

  it('Grow receives brand-scoped work for Travaholic independently', () => {
    const r = reg();
    run(r, 'Create a reel campaign — Grow should handle it for Moon', { brand: 'moonglasses' });
    const out = run(r, 'Post a product launch reel — Grow should handle it for Trav', { brand: 'caps' });
    expect(out.kind).toBe('work_created');
    expect(out.routing?.function).toBe('growth');
    expect(out.workItem?.owner?.id).toBe('DS-11');
    expect(out.workItem?.scope.brand).toBe('caps');

    const items = r.list();
    expect(items.length).toBe(2);
    const moonItem = items.find(i => i.scope.brand === 'moonglasses')!;
    const travItem = items.find(i => i.scope.brand === 'caps')!;
    expect(moonItem.id).not.toBe(travItem.id);
  });

  it('brand isolation is validated — no cross-brand data leakage', () => {
    const moonAssign = specialistForBrand('growth', 'moonglasses')!;
    const travAssign = specialistForBrand('growth', 'caps')!;

    expect(moonAssign.specialistId).toBe('DS-11');
    expect(travAssign.specialistId).toBe('DS-11');
    expect(moonAssign.brandScope.brand).toBe('moonglasses');
    expect(travAssign.brandScope.brand).toBe('caps');

    const moonIso = validateBrandIsolation(moonAssign, []);
    const travIso = validateBrandIsolation(travAssign, []);
    expect(moonIso.isolated).toBe(true);
    expect(travIso.isolated).toBe(true);
  });

  it('collision detection works for parallel brand work', () => {
    const r = reg();
    run(r, 'Create a reel campaign — Grow should handle it for Moon', { brand: 'moonglasses' });
    const items = r.list();
    r.transition(items[0].id, 'in_progress', CEO);

    // New Moon work should warn about brand overlap
    const check = checkCollisions(r, 'moonglasses', 'moon-glasses', null);
    expect(check.conflicts.length).toBeGreaterThan(0);

    // Trav work should be clean — different brand
    const travCheck = checkCollisions(r, 'caps', 'Travaholic_caps', null);
    expect(travCheck.ok).toBe(true);
  });

  it('independent result records per brand', () => {
    const r = reg();
    const moonOut = run(r, 'Create a social calendar — Grow should handle it for Moon', { brand: 'moonglasses' });
    const travOut = run(r, 'Create an ad campaign — Grow should handle it for Trav', { brand: 'caps' });

    // Each has its own audit trail
    const moonActions = r.actionsOf(moonOut.workItem!.id);
    const travActions = r.actionsOf(travOut.workItem!.id);
    expect(moonActions.length).toBeGreaterThan(0);
    expect(travActions.length).toBeGreaterThan(0);
    // Different work items — verify they're independent audit trails
    expect(moonOut.workItem!.id).not.toBe(travOut.workItem!.id);
  });

  it('CEO reporting: both items visible with correct brand scope', () => {
    const r = reg();
    run(r, 'Create a content plan — Grow should handle it for Moon', { brand: 'moonglasses' });
    run(r, 'Schedule reels — Grow should handle it for Trav', { brand: 'caps' });

    const all = r.list();
    const growWork = all.filter(i => i.owner?.id === 'DS-11');
    expect(growWork.length).toBe(2);
    expect(growWork.map(i => i.scope.brand).sort()).toEqual(['caps', 'moonglasses']);
  });
});

describe('Specialist pool completeness', () => {
  it('all 8 specialists are available', () => {
    expect(availableSpecialists().length).toBe(8);
  });

  it('function matching covers all specialist keywords', () => {
    expect(matchFunction('Launch the campaign on social')).toBe('growth');
    expect(matchFunction('Run the health check')).toBe('quality');
    expect(matchFunction('Send the NDA')).toBe('sales');
    expect(matchFunction('Generate the monthly invoice')).toBe('finance');
    expect(matchFunction('Handle the customer complaint')).toBe('customer_care');
    expect(matchFunction('Hello world')).toBeNull();
  });

  it('each brand has a specialist assignment with proper scope', () => {
    for (const brand of ['moonglasses', 'caps', 'korbi', 'ceremonykitchen', 'freshforpaws']) {
      const a = specialistForBrand('growth', brand);
      expect(a).toBeDefined();
      expect(a!.brandScope.brand).toBe(brand);
      expect(a!.specialistId).toBe('DS-11');
    }
  });
});
