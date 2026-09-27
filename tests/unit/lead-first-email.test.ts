import { describe, it, expect } from 'vitest';
import { firstEmailDraft, parseResearch } from '../../src/lib/lead-first-email';
import { voiceIssues } from '../../src/lib/lead-mail/core';

const now = new Date('2026-09-28T05:00:00Z');

describe('first email', () => {
  it('reads title and description from the site', () => {
    const r = parseResearch('https://kora.in', '<html><head><title>Kora &amp; Co</title><meta name="description" content="Linen made slowly."></head></html>', now);
    expect(r.title).toBe('Kora & Co');
    expect(r.description).toBe('Linen made slowly.');
  });
  it('quotes their own words, carries the terms and the NDA link, and keeps case studies confidential', () => {
    const d = firstEmailDraft({ brand_name: 'Kora', contact_name: 'Asha Rao', website: 'https://kora.in' }, parseResearch('https://kora.in', '<title>K</title><meta name="description" content="Linen made slowly.">', now), 'https://viratmohan.com/retail-os/nda/x', now);
    expect(d.subject).toBe('An idea for Kora');
    expect(d.body).toContain('Hi Asha,');
    expect(d.body).toContain('"Linen made slowly."');
    expect(d.body).toContain('40% of the profit pool');
    expect(d.body).toContain('revenue-share model');
    expect(d.body).toContain('https://viratmohan.com/retail-os/nda/x');
    expect(d.body).toContain("Let's talk.");
    expect(d.body).toContain('VM AI Assistant');
    expect(d.html).toContain('Sign the NDA');
    for (const s of ['Travaholic', '880', '1,399', '4,197']) { expect(d.body).not.toContain(s); expect(d.html).not.toContain(s); }
    expect(voiceIssues(d.body)).toEqual([]);
  });
});
