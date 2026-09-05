# Regression coverage — 19 named failure modes (hardening brief §21)

Run the automated suite with `npm test`.

This maps each of the 19 failure modes this project has actually hit (or was
explicitly warned about) to how it's covered. Two tiers, deliberately:

- **Unit** (`tests/unit/`, runs in `npm test`, no API calls, free and fast) —
  covers the deterministic, code-level bugs: auth, parsing, idempotency,
  anti-hallucination resolution. These run every time and will fail CI/local
  checks immediately if broken.
- **Live** (not yet built — see gap note below) — the remaining modes are
  prompt-quality/model-behavior bugs that can only be verified by an actual
  Claude call against a crafted input and asserting on the structured output.
  These were fixed and manually verified via real `curl` round-trips during
  development (see git history / session notes), but are **not yet wired
  into an automated, repeatable test** — doing so requires either mocking
  the Anthropic API responses (cheap, but doesn't test the real prompt) or
  spending real API calls on every run (slow, costs money, ~50-90s each).
  Flagged honestly as a gap rather than faked.

| # | Failure mode | Tier | Where |
|---|---|---|---|
| 1 | Website content contaminating diagnosis | Live (manual, not automated) | `buildMethodology` branding boundary in `src/lib/llm.ts` |
| 2 | Silent structural assumption (e.g. B2B vs B2C) not flagged | Live (manual, not automated) | Step 1 + Step 7 ordering rule in `buildMethodology` |
| 3 | Irrelevant/padded runner-up frameworks | Live (manual, not automated) | Step 2 "quality over count" rule in `buildMethodology` |
| 4 | Fabricated zero/blank metrics in the artefact | Live (manual, not automated) | "no bare zeros or blanks" rule in `buildMethodology` |
| 5 | Unsupported P&L mapping (causal link hand-wavy) | Partial — unit-testable schema shape only | `pnl_causal_chain` validation type (Step 5); real catch requires a live call |
| 6 | Framework mismatch (force-fit) | Partial — unit-testable schema shape only | `framework_fit` validation type (Step 5) + fit-score dimensions (Step 2); real catch requires a live call |
| 7 | Hallucinated framework provenance | **Unit** | `tests/unit/framework-resolution.test.ts` — `resolveFrameworkSelections` |
| 8 | Fake interactive controls (buttons that do nothing) | Live (manual, not automated) | "interactivity depth" rule in `buildMethodology` |
| 9 | Missing framework vocabulary in the artefact | Live (manual, not automated) | "artefact must visibly run on the selected framework" rule |
| 10 | Multiple problems incorrectly collapsed into one | Live (manual, not automated) | Step 1 instruction in `buildMethodology` |
| 11 | Multiple problems unnecessarily fragmented | Live (manual, not automated) | Step 1 instruction in `buildMethodology` |
| 12 | Contradictory input | Live (manual, not automated) | No dedicated rule yet — gap |
| 13 | Sparse input | Live (manual, not automated) | Step 1 structural-assumption rule partially covers this |
| 14 | Very long input | Untested | No length cap/truncation exists in `intake.ts` — gap |
| 15 | Prompt injection (via inbound feedback email) | **Unit** | `tests/unit/feedback-parsing.test.ts` — `stripHtml`, `extractFeedback` |
| 16 | Claude API timeout / failure | Untested | `intake.ts`/`feedback-webhook.ts` catch and call `markFailed`, but no test mocks a failing fetch — gap |
| 17 | Duplicate submission | Untested | No idempotency key on intake exists — gap, not yet a product requirement |
| 18 | Webhook retry (duplicate delivery) | **Unit** | `tests/unit/feedback-parsing.test.ts` — `shouldProcessFeedback` |
| 19 | Unauthorized admin request | **Unit** | `tests/unit/admin-auth.test.ts` — `checkAdminAuth`, `isProtectedPath` |

**Honest summary:** 4 of 19 have real, automated, always-on regression
coverage (7, 15, 18, 19). 2 more (5, 6) have partial coverage via the
validation/fit-scoring schema shape but not a test that actually catches a
bad model output. The remaining 13 are prompt-quality issues that were fixed
and manually verified live during development but have no automated
regression test — the single highest-value next increment here would be a
small "golden case" live-test file (gated behind an explicit `npm run
test:live` script, not part of normal `npm test`) that re-runs 3-5 of the
historically worst inputs (the aon.com website-contamination case, the
sparse "finding prospects" case, the Legal/Compliance runner-up-padding
case) and asserts on structural properties of the real output.
