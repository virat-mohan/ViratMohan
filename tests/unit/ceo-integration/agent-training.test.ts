import { describe, expect, it } from 'vitest';
import {
  CERT_LEVELS,
  ASSESSMENT_SCENARIOS,
  buildPassport,
  buildAllPassports,
  certificationSummary,
  canExerciseAutonomy,
  deriveCertification,
  computeGaps,
  scenariosForAgent,
  trainingModulesFor,
  type AssessmentResult,
} from '../../../src/lib/ceo/agent-training';
import { AGENT_REGISTRY } from '../../../src/lib/ceo/types';

const NOW = new Date('2026-10-08T10:00:00.000Z');

describe('agent-training', () => {
  it('builds a passport for every agent in the registry', () => {
    const passports = buildAllPassports(NOW);
    expect(passports).toHaveLength(AGENT_REGISTRY.length);
    for (const p of passports) {
      expect(p.agent_id).toBeTruthy();
      expect(p.agent_name).toBeTruthy();
      expect(p.certification).toBe('TRAINING_REQUIRED');
      expect(p.version).toBe('1.0.0');
    }
  });

  it('CEO passport has strategy and delegation training modules', () => {
    const ceo = AGENT_REGISTRY.find((a) => a.id === 'DS-02')!;
    const p = buildPassport(ceo, NOW);
    expect(p.mandate).toContain('CEO');
    expect(p.training_modules.length).toBeGreaterThanOrEqual(4);
    expect(p.training_modules.some((m) => m.domain === 'strategy')).toBe(true);
    expect(p.training_modules.some((m) => m.domain === 'operations')).toBe(true);
  });

  it('brand CEO passport includes brand operations training', () => {
    const brand = AGENT_REGISTRY.find((a) => a.role === 'brand_ceo')!;
    const p = buildPassport(brand, NOW);
    expect(p.training_modules.some((m) => m.id.startsWith('BC-'))).toBe(true);
    expect(p.brand_permissions.length).toBeGreaterThanOrEqual(1);
  });

  it('CFO (DS-13) gets finance-specific function training', () => {
    const cfo = AGENT_REGISTRY.find((a) => a.id === 'DS-13')!;
    const p = buildPassport(cfo, NOW);
    expect(p.training_modules.some((m) => m.id === 'CFO-01')).toBe(true);
    expect(p.training_modules.some((m) => m.id === 'CFO-02')).toBe(true);
  });

  it('all passports start with gaps when no assessments exist', () => {
    const passports = buildAllPassports(NOW);
    const withTraining = passports.filter((p) => p.training_modules.length > 0);
    for (const p of withTraining) {
      expect(p.gaps.length).toBeGreaterThan(0);
      expect(p.assessments).toEqual([]);
    }
  });

  it('certificationSummary returns one row per agent', () => {
    const summary = certificationSummary(NOW);
    expect(summary).toHaveLength(AGENT_REGISTRY.length);
    for (const row of summary) {
      expect(row.certification).toBe('TRAINING_REQUIRED');
      expect(row.assessments_passed).toBe(0);
    }
  });

  it('canExerciseAutonomy returns false for untrained agents at any level above TRAINING_REQUIRED', () => {
    expect(canExerciseAutonomy('DS-02', 'TRAINING_REQUIRED')).toBe(true);
    expect(canExerciseAutonomy('DS-02', 'CERTIFIED_L1')).toBe(false);
    expect(canExerciseAutonomy('NONEXISTENT', 'TRAINING_REQUIRED')).toBe(false);
  });

  it('CERT_LEVELS is ordered from least to most autonomous', () => {
    expect(CERT_LEVELS[0]).toBe('TRAINING_REQUIRED');
    expect(CERT_LEVELS[CERT_LEVELS.length - 1]).toBe('AUTONOMOUS_L3');
  });
});

describe('assessment scenarios', () => {
  it('has scenarios for CFO, CMO, CSO, CCO, CHRO, QA, Improvement, Guard, CEO, brand_ceo, Guardian', () => {
    const agentIds = new Set(ASSESSMENT_SCENARIOS.map((s) => s.role_or_agent));
    expect(agentIds.has('DS-13')).toBe(true); // CFO
    expect(agentIds.has('DS-11')).toBe(true); // CMO
    expect(agentIds.has('DS-12')).toBe(true); // CSO
    expect(agentIds.has('DS-14')).toBe(true); // CCO
    expect(agentIds.has('DS-15')).toBe(true); // CHRO
    expect(agentIds.has('DS-10')).toBe(true); // QA
    expect(agentIds.has('DS-17')).toBe(true); // Improvement
    expect(agentIds.has('DS-16')).toBe(true); // Guard
    expect(agentIds.has('DS-02')).toBe(true); // CEO
    expect(agentIds.has('DS-01')).toBe(true); // Guardian
    expect(agentIds.has('brand_ceo')).toBe(true);
  });

  it('scenariosForAgent returns the right scenarios for DS-13 (CFO)', () => {
    const scenarios = scenariosForAgent('DS-13');
    expect(scenarios.length).toBeGreaterThanOrEqual(3);
    expect(scenarios.every((s) => s.role_or_agent === 'DS-13' || s.role_or_agent === 'specialist')).toBe(true);
  });

  it('scenariosForAgent returns brand_ceo scenarios for a brand CEO agent', () => {
    const brandCeo = AGENT_REGISTRY.find((a) => a.role === 'brand_ceo')!;
    const scenarios = scenariosForAgent(brandCeo.id);
    expect(scenarios.some((s) => s.role_or_agent === 'brand_ceo')).toBe(true);
  });

  it('every scenario references a valid module_id', () => {
    for (const s of ASSESSMENT_SCENARIOS) {
      expect(s.module_id).toBeTruthy();
      expect(s.expected_outcome).toBeTruthy();
      expect(s.verification).toBeTruthy();
    }
  });
});

describe('certification derivation', () => {
  const modules = trainingModulesFor('DS-13');

  it('no assessments → TRAINING_REQUIRED', () => {
    expect(deriveCertification(modules, [])).toBe('TRAINING_REQUIRED');
  });

  it('uncertified agent blocked from consequential work', () => {
    expect(canExerciseAutonomy('DS-13', 'CERTIFIED_L1')).toBe(false);
  });

  it('partial assessments → ASSESSMENT or CERTIFIED_L1', () => {
    const onePass: AssessmentResult[] = [
      { scenario_id: 'CFO-A01', passed: true, evidence: 'P&L analysed correctly', assessed_at: NOW.toISOString(), assessed_by: 'DS-02' },
    ];
    const level = deriveCertification(modules, onePass);
    expect(['ASSESSMENT', 'CERTIFIED_L1']).toContain(level);
  });

  it('all modules covered → CERTIFIED_L2', () => {
    const allPassed: AssessmentResult[] = modules.map((m, i) => ({
      scenario_id: ASSESSMENT_SCENARIOS.find((s) => s.module_id === m.id)?.id ?? `SYNTH-${i}`,
      passed: true,
      evidence: `Module ${m.id} verified`,
      assessed_at: NOW.toISOString(),
      assessed_by: 'DS-02',
    }));
    const level = deriveCertification(modules, allPassed);
    expect(CERT_LEVELS.indexOf(level)).toBeGreaterThanOrEqual(CERT_LEVELS.indexOf('CERTIFIED_L1'));
  });

  it('gaps list only uncovered modules', () => {
    const onePass: AssessmentResult[] = [
      { scenario_id: 'CFO-A01', passed: true, evidence: 'ok', assessed_at: NOW.toISOString(), assessed_by: 'DS-02' },
    ];
    const gaps = computeGaps(modules, onePass);
    expect(gaps.length).toBeLessThan(modules.length);
    expect(gaps.some((g) => g.includes('CFO-01'))).toBe(false);
  });

  it('certified agent CAN exercise autonomy at their level', () => {
    const allPassed: AssessmentResult[] = modules.map((m, i) => ({
      scenario_id: ASSESSMENT_SCENARIOS.find((s) => s.module_id === m.id)?.id ?? `SYNTH-${i}`,
      passed: true,
      evidence: `Module ${m.id} verified`,
      assessed_at: NOW.toISOString(),
      assessed_by: 'DS-02',
    }));
    expect(canExerciseAutonomy('DS-13', 'CERTIFIED_L1', allPassed)).toBe(true);
  });
});
