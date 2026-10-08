import { describe, expect, it } from 'vitest';
import {
  CERT_LEVELS,
  buildPassport,
  buildAllPassports,
  certificationSummary,
  canExerciseAutonomy,
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
