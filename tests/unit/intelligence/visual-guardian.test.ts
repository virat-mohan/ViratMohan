import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  VISUAL_GUARDIAN_ID, VISUAL_GUARDIAN_PASSPORT,
  checkPlatformCompliance, resolveReleaseGate,
  SIGNATURE_COLOUR_LINE, PLATFORM_HIERARCHY, QUALITY_DIMENSIONS, AUTO_REJECT_CRITERIA,
} from '../../../src/lib/intelligence/visual-guardian';
import type { DesignReview, PlatformComplianceCheck } from '../../../src/lib/intelligence/visual-guardian';
import { AGENT_REGISTRY, findAgent } from '../../../src/lib/ceo/types';
import { isRunaway, RUNAWAY_LIMITS, requiresFableGovernance, isRoutineRouting, validateFableJustification, qualityFloorFor } from '../../../src/lib/intelligence/governance';
import { routeTask, agentPolicy } from '../../../src/lib/intelligence/router';
import { withAvailability } from '../../../src/lib/intelligence/models';
import type { TaskProfile } from '../../../src/lib/intelligence/router';

import { ROLE_BINDINGS, holdersOf, rolesHeldBy } from '../../../src/lib/ceo/roles';
import { VIRAT, PRINCE } from '../../../src/lib/work/actors';
import { canCeoAssign, resolveApprovalAuthority } from '../../../src/lib/ceo/authority';

const passingCompliance: PlatformComplianceCheck = {
  signatureColourLine: true, platformTypography: true, breadcrumbs: true,
  mobileUsability: true, touchTargets44px: true, noHorizontalOverflow: true,
  navigationHierarchy: true, brandContentWithinPlatform: true,
};

// ── Visual Design & Brand Guardian agent ─────────────────────────────────

describe('Visual Design & Brand Guardian: agent definition', () => {
  // Test 20: agent registry
  it('is registered in the agent registry as DS-16', () => {
    const agent = findAgent(VISUAL_GUARDIAN_ID);
    assert.ok(agent, 'DS-16 must be in AGENT_REGISTRY');
    assert.equal(agent.name, 'Guard');
    assert.equal(agent.role, 'specialist');
  });

  // Test 21: CMO reporting line
  it('reports to DS-11 Grow (CMO function)', () => {
    const agent = findAgent(VISUAL_GUARDIAN_ID)!;
    assert.equal(agent.reports_to, 'DS-11');
    assert.equal(VISUAL_GUARDIAN_PASSPORT.reportsTo, 'DS-11');
  });

  // Test 22: correct purpose
  it('has the correct purpose', () => {
    assert.ok(VISUAL_GUARDIAN_PASSPORT.purpose.includes('visual QA'));
    assert.ok(VISUAL_GUARDIAN_PASSPORT.purpose.includes('brand'));
    assert.ok(VISUAL_GUARDIAN_PASSPORT.purpose.includes('platform'));
  });

  // Test 23: correct authority scope
  it('defines what it can and cannot do', () => {
    assert.ok(VISUAL_GUARDIAN_PASSPORT.canDo.includes('reject'));
    assert.ok(VISUAL_GUARDIAN_PASSPORT.canDo.includes('approve'));
    assert.ok(VISUAL_GUARDIAN_PASSPORT.canDo.includes('identify-brand-drift'));
    assert.ok(VISUAL_GUARDIAN_PASSPORT.canDo.includes('identify-platform-drift'));
  });

  // Test 24: can reject critical defects
  it('can reject work with critical defects', () => {
    const review: DesignReview = {
      assetId: 'a-1', brand: 'caps', verdict: 'blocked',
      defects: [{ severity: 'critical', category: 'distorted-logos', description: 'Logo is stretched', location: 'hero.png' }],
      platformCompliance: passingCompliance, releaseReady: false,
    };
    assert.equal(resolveReleaseGate(review), 'revision_required');
  });

  // Test 25: cannot rewrite Brand Foundation
  it('cannot rewrite Brand Foundation', () => {
    assert.ok(VISUAL_GUARDIAN_PASSPORT.cannotDo.includes('rewrite-brand-foundation'));
  });

  // Test 26: cannot rewrite Brand Book
  it('cannot rewrite Brand Book', () => {
    assert.ok(VISUAL_GUARDIAN_PASSPORT.cannotDo.includes('rewrite-brand-book'));
  });

  // Test 27: cannot bypass Founder authority
  it('cannot override the Founder', () => {
    assert.ok(VISUAL_GUARDIAN_PASSPORT.cannotDo.includes('override-founder'));
  });

  // Test 28: platform branding is part of review
  it('checks platform branding as part of every review', () => {
    const failing: PlatformComplianceCheck = { ...passingCompliance, signatureColourLine: false };
    const result = checkPlatformCompliance(failing);
    assert.equal(result.pass, false);
    assert.ok(result.failures.some((f) => f.includes('vm-band')));
  });

  // Test 29: signature-line requirement
  it('knows the canonical signature colour line', () => {
    assert.equal(SIGNATURE_COLOUR_LINE.cssClass, 'vm-band');
    assert.deepEqual([...SIGNATURE_COLOUR_LINE.colours], ['#d4af37', '#e91e8c', '#3e6fa6', '#d9714b']);
    assert.equal(SIGNATURE_COLOUR_LINE.source, '/brand/tokens.css');
  });

  // Test 30: mobile/breadcrumb requirement
  it('fails compliance when breadcrumbs or mobile usability is missing', () => {
    assert.equal(checkPlatformCompliance({ ...passingCompliance, breadcrumbs: false }).pass, false);
    assert.equal(checkPlatformCompliance({ ...passingCompliance, mobileUsability: false }).pass, false);
    assert.equal(checkPlatformCompliance({ ...passingCompliance, touchTargets44px: false }).pass, false);
  });
});

// ── Role model (unchanged) ───────────────────────────────────────────────

describe('Role model integrity', () => {
  // Test 31: technical_deployment_officer remains correct
  it('technical_deployment_officer role exists in bindings', () => {
    assert.ok(ROLE_BINDINGS.technical_deployment_officer);
    assert.equal(Object.keys(ROLE_BINDINGS).length, 1);
  });

  // Test 32: Prince Keshri remains sole current holder
  it('Prince Keshri is the sole holder of technical_deployment_officer', () => {
    const holders = holdersOf('technical_deployment_officer');
    assert.equal(holders.length, 1);
    assert.equal(holders[0].name, 'Prince Keshri');
    assert.deepEqual(holders[0].actor, PRINCE);
  });

  // Test 33: Virat approval requirement intact
  it('Virat approval is still required for prince_assignment', () => {
    assert.equal(resolveApprovalAuthority('prince_assignment').capability, 'approve-restricted-assignment');
    assert.deepEqual(resolveApprovalAuthority('prince_assignment').holders, ['virat']);
    assert.equal(canCeoAssign(PRINCE).allowed, false);
  });
});

// ── Governance: anti-runaway ─────────────────────────────────────────────

describe('Governance: anti-runaway and Fable restrictions', () => {
  it('detects runaway invocations', () => {
    assert.equal(isRunaway({ totalInvocations: 21, totalEscalations: 0, consecutiveFailures: 0, elapsedMinutes: 5 }).runaway, true);
    assert.equal(isRunaway({ totalInvocations: 5, totalEscalations: 0, consecutiveFailures: 0, elapsedMinutes: 5 }).runaway, false);
  });

  it('detects runaway escalations', () => {
    assert.equal(isRunaway({ totalInvocations: 3, totalEscalations: 4, consecutiveFailures: 0, elapsedMinutes: 5 }).runaway, true);
  });

  it('Fable models require governance', () => {
    assert.equal(requiresFableGovernance('claude-fable-5-1'), true);
    assert.equal(requiresFableGovernance('claude-sonnet-5-5'), false);
  });

  it('validates Fable justification', () => {
    const valid = validateFableJustification({
      taskDescription: 'Cross-system migration', reason: 'Exceptional complexity',
      estimatedDurationMinutes: 60, estimatedCostFactor: 100,
      expectedValue: 'Complete system migration', whyLowerModelInsufficient: 'Opus failed on step 3',
      authorityHolder: 'DS-00',
    });
    assert.equal(valid.valid, true);

    const invalid = validateFableJustification({
      taskDescription: '', reason: '', estimatedDurationMinutes: null,
      estimatedCostFactor: null, expectedValue: '', whyLowerModelInsufficient: '', authorityHolder: '',
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.missing.length >= 4);
  });

  it('routine routing does not require CEO consultation', () => {
    assert.equal(isRoutineRouting('claude-haiku-4-5'), true);
    assert.equal(isRoutineRouting('claude-sonnet-5-5'), true);
    assert.equal(isRoutineRouting('claude-opus-5-5'), false);
  });

  it('quality floors exist for critical domains', () => {
    assert.equal(qualityFloorFor('security-analysis')?.minimumTier, 'premium');
    assert.equal(qualityFloorFor('cross-system-design')?.minimumTier, 'elite');
    assert.equal(qualityFloorFor('trivial-lookup'), undefined);
  });
});

// ── Model Router + Visual Agent integration ──────────────────────────────

describe('Visual Guardian uses the Model Router', () => {
  it('routine QA routes to standard tier', () => {
    const task: TaskProfile = {
      complexity: 'simple', risk: 'low', dependentSteps: 1, systemsAffected: 1,
      materiality: 'low', reversible: true, qualityRequirement: 'standard',
      autonomyLevel: 'L1', humanReview: true, agentId: 'DS-16',
    };
    const result = routeTask(task, withAvailability(['claude-haiku-4-5', 'claude-sonnet-5-5']));
    assert.equal(result.tier, 'economy');
  });

  it('serious brand-system review routes to premium', () => {
    const task: TaskProfile = {
      complexity: 'complex', risk: 'medium', dependentSteps: 3, systemsAffected: 2,
      materiality: 'high', reversible: false, qualityRequirement: 'rigorous',
      autonomyLevel: 'L1', humanReview: false, agentId: 'DS-16', minimumTier: 'premium',
    };
    const result = routeTask(task, withAvailability(['claude-sonnet-5-5', 'claude-opus-4-7', 'claude-opus-4-8']));
    assert.ok(['premium', 'elite'].includes(result.tier));
  });
});

// ── Work Registry: audit integration ─────────────────────────────────────

describe('Model/visual governance auditable where material', () => {
  // Test 34: routing decisions carry enough information for audit
  it('routing decisions contain reason, escalation status, and governance flags', () => {
    const task: TaskProfile = {
      complexity: 'complex', risk: 'high', dependentSteps: 4, systemsAffected: 3,
      materiality: 'high', reversible: false, qualityRequirement: 'rigorous',
      autonomyLevel: 'L2', humanReview: false,
    };
    const result = routeTask(task, withAvailability(['claude-sonnet-5-5', 'claude-opus-4-8']));
    assert.ok(result.reason.length > 0, 'reason must be non-empty');
    assert.ok(typeof result.escalated === 'boolean');
    assert.ok(typeof result.ceoConsultation === 'boolean');
    assert.ok(typeof result.fableGovernance === 'boolean');
  });
});
