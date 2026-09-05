// Benchmark case suite (hardening brief §21's "20-30 case" idea — this is
// a starter set of 5 REAL cases, each one a regression this session
// actually hit and fixed live, not a hypothetical). Gated out of `npm
// test` — this calls the real Anthropic API (classifyAndBuild directly,
// no Supabase needed) and costs real money/time per run (~60-90s × 5
// cases). Run explicitly with `npm run test:live`, and only with
// ANTHROPIC_API_KEY set in the environment.
//
// These assertions check structural/regression invariants that are
// mechanically verifiable — they do NOT replace a human judging whether
// a diagnosis is actually good. A green run here means "the known
// failure modes haven't come back," not "this output is excellent."
import { describe, it, expect, beforeAll } from 'vitest';
import { classifyAndBuild, FIT_DIMENSIONS, ARTEFACT_VALIDATION_TYPES } from '../../src/lib/llm';
import { BENCHMARK_CASES, MINI_LIBRARY } from './cases';

const apiKey = process.env.ANTHROPIC_API_KEY;

beforeAll(() => {
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set — tests/benchmarks requires a real API key and is not part of `npm test`. Run with `npm run test:live` and the key exported in your environment.'
    );
  }
});

const FORBIDDEN_CONTAMINATION_WORDS = ['insurance', 'broker', 'producer', 'aon'];

describe('benchmark cases (live)', () => {
  for (const bench of BENCHMARK_CASES) {
    it(
      bench.name,
      async () => {
        const result = await classifyAndBuild(
          { ...bench.input, frameworkLibrary: MINI_LIBRARY, pastFrameworkUsage: [] },
          apiKey!
        );

        // --- universal structural invariants, every case ---
        expect(result.problemBreakdown.length).toBeGreaterThan(0);
        expect(result.frameworkSelections.length).toBe(result.problemBreakdown.length);
        expect(result.solutionMechanisms.length).toBe(result.problemBreakdown.length);
        expect(result.artefactHtml.length).toBeGreaterThan(200);

        // validations: all 4 fixed types present for problem_index 0
        const validationTypesSeen = new Set(result.validations.filter((v) => v.problem_index === 0).map((v) => v.validation_type));
        expect(validationTypesSeen.has('root_cause_evidence')).toBe(true);
        expect(validationTypesSeen.has('framework_fit')).toBe(true);
        expect(validationTypesSeen.has('pnl_causal_chain')).toBe(true);
        expect(validationTypesSeen.has('economic_plausibility')).toBe(true);

        // artefact_validations: all 5 fixed types present, none silently missing
        const artefactTypesSeen = new Set(result.artefactValidations.map((v) => v.validation_type));
        for (const t of ARTEFACT_VALIDATION_TYPES) {
          expect(artefactTypesSeen.has(t)).toBe(true);
        }

        // fit_candidates: every candidate scored on all 9 fixed dimensions
        for (const fs of result.frameworkSelections) {
          for (const candidate of fs.fit_candidates) {
            const dims = new Set(candidate.dimension_scores.map((d) => d.dimension));
            for (const d of FIT_DIMENSIONS) {
              expect(dims.has(d)).toBe(true);
            }
          }
        }

        // --- case-specific regression guards ---
        if (bench.name === 'website-contamination-guard') {
          const diagnosisText = JSON.stringify(result.problemBreakdown).toLowerCase();
          for (const word of FORBIDDEN_CONTAMINATION_WORDS) {
            expect(diagnosisText.includes(word)).toBe(false);
          }
        }

        if (bench.name === 'sparse-input-structural-assumption') {
          expect(result.problemBreakdown[0].confidence_level).not.toBe('strongly_supported');
          expect(result.clarifyingQuestions.length).toBeGreaterThan(0);
          const firstQuestion = result.clarifyingQuestions[0].toLowerCase();
          expect(firstQuestion.includes('b2b') || firstQuestion.includes('b2c') || firstQuestion.includes('motion')).toBe(true);
        }

        if (bench.name === 'legal-compliance-runner-up-padding-guard') {
          // Not asserting semantic relevance (needs human judgment) — just
          // that the count didn't balloon past the prompt's own 3-7 cap.
          expect(result.frameworkSelections[0].runner_up_names.length).toBeLessThanOrEqual(7);
        }
      },
      120_000
    );
  }
});
