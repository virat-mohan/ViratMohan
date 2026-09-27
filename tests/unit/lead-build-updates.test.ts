import { describe, it, expect } from 'vitest';
import { buildUpdateDraft } from '../../src/lib/lead-build-updates';
import { voiceIssues } from '../../src/lib/lead-mail/core';

const now = new Date('2026-09-28T05:00:00Z');

describe('build update note', () => {
  it('says done, next and what is needed, in Virat\'s voice', () => {
    const d = buildUpdateDraft({ brand_name: 'Kora', contact_name: 'Asha', clock_started_at: '2026-09-25T05:00:00Z' }, [
      { task: 'Catalog imported', status: 'done', owner: 'team' },
      { task: 'Razorpay connected', status: 'doing', owner: 'team' },
      { task: 'Share your GST certificate', status: 'todo', owner: 'brand' },
      { task: 'Old thing', status: 'na', owner: 'team' },
    ], now)!;
    expect(d.subject).toBe('Kora: 33% built');
    expect(d.body).toContain('on track for Friday, 2 October');
    expect(d.body).toContain('- Catalog imported');
    expect(d.body).toContain('- Razorpay connected');
    expect(d.body).toContain('One thing I need from you');
    expect(d.body).toContain('- Share your GST certificate');
    expect(d.body).not.toContain('Prince');
    expect(voiceIssues(d.body)).toEqual([]);
  });
  it('is quiet with no tasks', () => {
    expect(buildUpdateDraft({ brand_name: 'Kora' }, [], now)).toBeNull();
  });
});
