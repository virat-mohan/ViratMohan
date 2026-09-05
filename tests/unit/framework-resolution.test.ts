import { describe, it, expect } from 'vitest';
import { resolveFrameworkSelections, type RawFrameworkSelection, type FrameworkLibraryEntry } from '../../src/lib/llm';

const library: FrameworkLibraryEntry[] = [
  {
    name: 'AARRR (Pirate Metrics)',
    source: 'Dave McClure / 500 Startups',
    business_function: 'Growth (sales & marketing)',
    when_to_use: 'Funnel-stage-specific drop-off.',
    link: 'https://en.wikipedia.org/wiki/Pirate_funnel',
  },
];

function rawSelection(overrides: Partial<RawFrameworkSelection>): RawFrameworkSelection {
  return {
    problem_index: 0,
    framework_name: 'AARRR (Pirate Metrics)',
    why_selected: 'Fits the funnel drop-off.',
    in_library: true,
    runner_up_names: [],
    fit_candidates: [],
    ...overrides,
  };
}

// Failure mode #7 (brief §21): "hallucinated framework provenance" — the
// model must never be trusted for a framework's source/link; only an exact
// match against the admin-curated library may carry those through. This is
// the core anti-hallucination design of the whole citation system.
describe('resolveFrameworkSelections', () => {
  it('pulls source and link from the curated library for an exact name match', () => {
    const [resolved] = resolveFrameworkSelections([rawSelection({})], library);
    expect(resolved.framework_source).toBe('Dave McClure / 500 Startups');
    expect(resolved.framework_link).toBe('https://en.wikipedia.org/wiki/Pirate_funnel');
    expect(resolved.in_library).toBe(true);
  });

  it('matches case-insensitively and trims whitespace, without trusting the model for anything but the name', () => {
    const [resolved] = resolveFrameworkSelections(
      [rawSelection({ framework_name: '  aarrr (pirate metrics)  ' })],
      library
    );
    expect(resolved.framework_source).toBe('Dave McClure / 500 Startups');
    expect(resolved.in_library).toBe(true);
  });

  it('never surfaces a link for a framework the model invented (not in the library)', () => {
    const [resolved] = resolveFrameworkSelections(
      [
        rawSelection({
          framework_name: 'Totally Made Up Framework',
          in_library: false,
          suggested_source: 'The model claims: McKinsey, 1990',
        }),
      ],
      library
    );
    expect(resolved.framework_link).toBeNull();
    expect(resolved.in_library).toBe(false);
    // The model's own citation is passed through, but only ever as an
    // unresolved, flagged claim — never presented as a verified source.
    expect(resolved.framework_source).toBe('The model claims: McKinsey, 1990');
  });

  it('flags a framework with no source at all as unverified rather than leaving it blank', () => {
    const [resolved] = resolveFrameworkSelections(
      [rawSelection({ framework_name: 'Unknown Thing', in_library: false, suggested_source: undefined })],
      library
    );
    expect(resolved.framework_source).toBe('Unverified — model-suggested');
    expect(resolved.framework_link).toBeNull();
  });

  it('drops a runner-up name that does not match the library rather than fabricating one', () => {
    const [resolved] = resolveFrameworkSelections(
      [rawSelection({ runner_up_names: ['AARRR (Pirate Metrics)', 'Some Framework Not In The Library'] })],
      library
    );
    expect(resolved.runner_ups).toHaveLength(1);
    expect(resolved.runner_ups[0].name).toBe('AARRR (Pirate Metrics)');
  });

  it('carries the internal fit-score candidates through unchanged (admin-only, not a factual citation to verify)', () => {
    const [resolved] = resolveFrameworkSelections(
      [
        rawSelection({
          fit_candidates: [
            {
              framework_name: 'AARRR (Pirate Metrics)',
              is_selected: true,
              dimension_scores: [{ dimension: 'problem_pattern_fit', score: 5 }],
              total_score: 5,
              positive_evidence: 'Direct funnel fit.',
              negative_evidence: 'none material',
            },
          ],
        }),
      ],
      library
    );
    expect(resolved.fitCandidates).toHaveLength(1);
    expect(resolved.fitCandidates[0].total_score).toBe(5);
  });
});
