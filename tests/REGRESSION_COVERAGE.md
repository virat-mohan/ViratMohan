# Regression coverage — 19 named failure modes (hardening brief §21)

Run the free/fast suite with `npm test`. Run the live benchmark suite with
`npm run test:live` (requires `ANTHROPIC_API_KEY`, calls the real Claude API,
costs real time/money — ~60-90s × 5 cases, not part of `npm test`).

This maps each of the 19 failure modes this project has actually hit (or was
explicitly warned about) to how it's covered. Three tiers now:

- **Unit** (`tests/unit/`, runs in `npm test`, no API calls, free and fast) —
  covers the deterministic, code-level bugs: auth, parsing, idempotency,
  anti-hallucination resolution.
- **Benchmark** (`tests/benchmarks/`, runs in `npm run test:live` only) — 5
  real cases (`tests/benchmarks/cases.ts`), each one a regression this
  session actually hit and fixed live (documented in each case's
  `provenance` field), re-run against the real `classifyAndBuild` call with
  assertions on structural invariants. This is a starter set, not the
  20-30 cases the brief eventually calls for.
- **Live (manual only)** — verified by hand via `curl` during development,
  no automated test yet.

| # | Failure mode | Tier | Where |
|---|---|---|---|
| 1 | Website content contaminating diagnosis | **Benchmark** | `website-contamination-guard` case — asserts diagnosis text excludes "insurance"/"broker"/"producer"/"aon" |
| 2 | Silent structural assumption (e.g. B2B vs B2C) not flagged | **Benchmark** | `sparse-input-structural-assumption` case — asserts confidence isn't `strongly_supported` and the first clarifying question raises the B2B/B2C ambiguity |
| 3 | Irrelevant/padded runner-up frameworks | **Benchmark** (partial) | `legal-compliance-runner-up-padding-guard` case — asserts the count stays ≤7; doesn't check semantic relevance, that needs human judgment |
| 4 | Fabricated zero/blank metrics in the artefact | Live (manual, not automated) | "no bare zeros or blanks" rule in `buildMethodology`; Step 9 artefact validation (`no_bare_zeros`) now self-checks this every run in production, but isn't asserted in the benchmark suite yet |
| 5 | Unsupported P&L mapping (causal link hand-wavy) | Partial — unit-testable schema shape only | `pnl_causal_chain` validation type (Step 5); real catch requires a live call |
| 6 | Framework mismatch (force-fit) | Partial — unit-testable schema shape only | `framework_fit` validation type (Step 5) + fit-score dimensions (Step 2); real catch requires a live call |
| 7 | Hallucinated framework provenance | **Unit** | `tests/unit/framework-resolution.test.ts` — `resolveFrameworkSelections` |
| 8 | Fake interactive controls (buttons that do nothing) | Live (manual, not automated) | "interactivity depth" rule + Step 9's `has_run_control` self-check in production; not yet asserted in the benchmark suite |
| 9 | Missing framework vocabulary in the artefact | Live (manual, not automated) | Step 9's `framework_vocabulary_present` self-check in production; not yet asserted in the benchmark suite |
| 10 | Multiple problems incorrectly collapsed into one | Live (manual, not automated) | Step 1 instruction in `buildMethodology` |
| 11 | Multiple problems unnecessarily fragmented | Live (manual, not automated) | Step 1 instruction in `buildMethodology` |
| 12 | Contradictory input | Live (manual, not automated) | No dedicated rule yet — gap |
| 13 | Sparse input | **Benchmark** | Same case as #2 |
| 14 | Very long input | Untested | No length cap/truncation exists in `intake.ts` — gap |
| 15 | Prompt injection (via inbound feedback email) | **Unit** | `tests/unit/feedback-parsing.test.ts` — `stripHtml`, `extractFeedback` |
| 16 | Claude API timeout / failure | Untested | `intake.ts`/`feedback-webhook.ts` catch and call `markFailed`, but no test mocks a failing fetch — gap |
| 17 | Duplicate submission | Untested | No idempotency key on intake exists — gap, not yet a product requirement |
| 18 | Webhook retry (duplicate delivery) | **Unit** | `tests/unit/feedback-parsing.test.ts` — `shouldProcessFeedback` |
| 19 | Unauthorized admin request | **Unit** | `tests/unit/admin-auth.test.ts` — `checkAdminAuth`, `isProtectedPath` |

**Honest summary:** 4 of 19 have unit coverage (7, 15, 18, 19); 3 more (1, 2,
13) now have live-benchmark coverage. 2 (5, 6) have partial schema-shape
coverage. The remaining 10 still have no automated test. Two things worth
noting: the benchmark suite has NOT been executed by Claude in this
environment — there's no `ANTHROPIC_API_KEY` available in this sandbox, so
`tests/benchmarks/run-benchmarks.test.ts` is structurally verified (it
parses, and fails fast with a clear message when the key is absent) but not
run end-to-end. Run it yourself with a real key to confirm the 5 cases
actually pass. Also, artefact-level checks (#4, #8, #9) are now genuinely
self-audited on every real production run via Step 9's `artefactValidations`
(see `src/lib/llm.ts` and the "Artefact validation" section in admin), but
that in-product self-check is not the same as an independent automated test
asserting on it — a reasonable next increment is adding those assertions to
the benchmark suite once it's been run and confirmed stable.
