// Phase 6: Shared learning operational — parse, integrate, query
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseLearningsMd,
  workLearningToRecord,
  checkLearnings,
  deduplicateLearnings,
  learningsSummary,
  type LearningRecord,
} from '../../../src/lib/ceo/shared-learning';

const LEARNINGS_PATH = join(__dirname, '../../../case-study/LEARNINGS.md');
const content = readFileSync(LEARNINGS_PATH, 'utf-8');

describe('Phase 6: Shared learning', () => {
  it('parses all entries from LEARNINGS.md', () => {
    const records = parseLearningsMd(content);
    expect(records.length).toBeGreaterThanOrEqual(70);
    expect(records.every(r => r.date.match(/^\d{4}-\d{2}-\d{2}$/))).toBe(true);
    expect(records.every(r => r.source === 'learnings_md')).toBe(true);
  });

  it('detects modules from learning text', () => {
    const records = parseLearningsMd(content);
    const emailLearnings = records.filter(r => r.modules.includes('email'));
    expect(emailLearnings.length).toBeGreaterThan(0);
    const gitLearnings = records.filter(r => r.modules.includes('git'));
    expect(gitLearnings.length).toBeGreaterThan(0);
  });

  it('converts Work Registry learning to a record', () => {
    const record = workLearningToRecord('WRK-001', {
      lesson: 'Always check email links before sending',
      reference: 'link-check.ts',
      rule_added: true,
    }, '2026-10-10T10:00:00Z');
    expect(record.source).toBe('work_registry');
    expect(record.workItemId).toBe('WRK-001');
    expect(record.modules).toContain('email');
  });

  it('queries learnings by module scope', () => {
    const records = parseLearningsMd(content);
    const relevant = checkLearnings(records, { modules: ['checkout'] });
    expect(relevant.length).toBeGreaterThan(0);
    expect(relevant.every(r => r.modules.includes('checkout'))).toBe(true);
  });

  it('queries learnings by action keyword', () => {
    const records = parseLearningsMd(content);
    const relevant = checkLearnings(records, { action: 'deploy' });
    expect(relevant.length).toBeGreaterThan(0);
  });

  it('deduplicates records with similar rules', () => {
    const records: LearningRecord[] = [
      { date: '2026-10-01', trigger: 'Test', rule: 'Always check links before sending.', modules: ['email'], source: 'learnings_md', workItemId: null },
      { date: '2026-10-02', trigger: 'Test2', rule: 'Always check links before sending.', modules: ['email'], source: 'work_registry', workItemId: 'W1' },
    ];
    const deduped = deduplicateLearnings(records);
    expect(deduped.length).toBe(1);
  });

  it('produces a summary with module and source counts', () => {
    const records = parseLearningsMd(content);
    const summary = learningsSummary(records);
    expect(summary.total).toBeGreaterThanOrEqual(70);
    expect(summary.bySource['learnings_md']).toBe(summary.total);
    expect(Object.keys(summary.byModule).length).toBeGreaterThan(3);
  });

  it('returns empty when no learnings match', () => {
    const records = parseLearningsMd(content);
    const relevant = checkLearnings(records, { modules: ['nonexistent_module_xyz'] });
    expect(relevant.length).toBe(0);
  });
});
