# Intelligence Governance: Model Registry, Router, Visual Guardian

Status: **CODE COMPLETE and TESTED** (deterministic contract only — no live provider switching).

## Model Registry

Central source of truth: `src/lib/intelligence/models.ts`.

Ten models from Haiku 4.5 (economy, cost factor 1) to Fable 5.1 (specialist, cost factor 100). Every model's `available` flag defaults to `false` — the runtime must confirm availability before routing to it. Cost factors are approximate relative ratios for routing decisions, not billing.

**No model is claimed as available to the runtime** until the provider integration confirms it. This is a contract, not a connection.

## Model Router

Central router: `src/lib/intelligence/router.ts`.

Core rule: **choose the least expensive model that is reasonably sufficient for the required result.** Not the most powerful. Not the cheapest when the expected cost of failure is materially higher.

### Task classification factors

Complexity (trivial → exceptional), risk (none → critical), dependent steps, systems affected, materiality (negligible → critical), reversibility, quality requirement (best-effort → rigorous), autonomy level, human review.

### Routing flow

TASK → CLASSIFY → COMPLEXITY → RISK → MATERIALITY → QUALITY REQUIREMENT → AUTONOMY → EXPECTED VALUE → AVAILABLE MODELS → LEAST-COST SUFFICIENT MODEL → EXECUTE → QUALITY CHECK → ESCALATE IF REQUIRED → LEARN

### Direction

The router moves **both ways**:

- **Down**: simple lookup → Haiku. Simple classification → Haiku. Routine edit → Haiku/Sonnet. Human-reviewed moderate work → economy tier.
- **Up**: difficult debugging → Opus. Major architecture → Opus 5/5.5. Exceptionally complex autonomous work → Fable (with governance).

### Agent defaults

Every agent has a configurable default model (all currently Sonnet 5.5) and an escalation list. Brand CEOs share one policy. Defaults are STARTING points — task requirements override them.

| Agent | Default | Escalation ceiling |
|---|---|---|
| DS-02 Dev (CEO) | Sonnet 5.5 | Opus 5.5 / Fable 5.1 |
| DS-11 Grow (CMO) | Sonnet 5.5 | Opus 4.7 / Opus 5.5 |
| DS-13 Books (CFO) | Sonnet 5.5 | Opus 4.8 / Opus 5.5 |
| DS-16 Guard (Visual) | Sonnet 5.5 | Opus 4.7 / 4.8 / 5.5 |
| DS-17 Improve (Process Efficiency) | Sonnet 5.5 | Opus 4.7 / Opus 5.5 |
| Brand CEOs | Sonnet 5.5 | Opus 4.7 / Opus 5.5 |
| Routine HOD ops | Sonnet 5.5 | Opus 4.7 |

### Result-based escalation

If a result fails quality: escalate to the next tier. Bounded at 3 attempts. CEO review required at the ceiling.

### Quality floors

Domains where cost optimisation must not underpower:

| Domain | Minimum tier |
|---|---|
| Major architecture | Premium |
| Security analysis | Premium |
| Financial architecture | Premium |
| Brand-system review | Premium |
| Cross-system design | Elite |

## Hard rules

### Model ≠ Authority

A stronger model receives **NO** additional authority. Fable 5.1 at L1 still means recommendation only. The routing decision carries no authority claim.

### CEO consultation

Required for: exceptional model expenditure, major cross-system use, prolonged autonomous operation, new model/provider, repeated escalations, material quality/cost tradeoffs. NOT required for routine Haiku/Sonnet routing.

### Myoho consultation

Required for: company-principle issues, ethical issues, quality-vs-cost philosophy, strategic principles, exceptional autonomy. NOT required for routine model selection.

### Fable governance

Fable 5 / Fable 5.1 must NOT become normal models. Require: unusually complex, long-running, highly autonomous, high consequence, major cross-system, demonstrated lower-model insufficiency. Record: task, reason, estimated duration, expected cost, expected value, why lower model insufficient, authority.

### Anti-runaway

| Limit | Value |
|---|---|
| Max invocations per task | 20 |
| Max escalations per task | 3 |
| Max consecutive failures | 3 |
| Max elapsed minutes | 120 |

## Cost attribution

Every model invocation carries: agent, task, model, brand. Hierarchy: company → product → brand → function → process → task → agent → model → operation. Clean hooks exist; the full economics system is NOT built.

## Responsible Technology Policy

Source: `src/lib/intelligence/responsible-technology.ts`.

13 canonical rules (RT-01 through RT-13) enforced via an `InvocationGuard` that gates every AI call. The guard checks: AI necessity, cached result availability, retry limits, escalation limits, runtime limits. Applies to all agents.

**Policy implemented. Runtime enforcement is via the guard contract — no live provider integration yet.**

## Invocation gate

Source: `src/lib/intelligence/invocation-gate.ts`. `gateInvocation()` is the one place a model call is approved. It stops runaways, requires a runtime-confirmed model, routes with `routeTask`, applies the responsible-technology guard, enforces the Fable justification and a per-call cost ceiling, requires CEO/Myoho approval where routing says so, and returns an attribution record. A permit always carries `grantsAuthority: false`.

**Status: ENFORCED at every production call site (INTEGRATION VERIFIED by tests and the build; not yet exercised against the live Anthropic API after deploy). RUNTIME PROVIDER PROBING AND AUTOMATIC SWITCHING NOT IMPLEMENTED.**

`src/lib/intelligence/provider.ts` is the only file that calls the Anthropic API. Every call site names an operation (`src/lib/intelligence/operations.ts`: owning agent, task profile, cost ceiling, basis) and calls `governedMessages`. The router chooses the model from the profile; the call site cannot. `tests/unit/intelligence/provider-boundary.test.ts` fails if any other file calls the API, builds an Anthropic request, or carries a `claude-*` model id literal. Each call logs one structured line (operation, agent, model, tier, hierarchy, retry, round, status, duration).

Operations and where they route today (only the models existing code already called are configured: `claude-sonnet-5` and `claude-opus-5-5`):

| Operation | Agent | Routes to |
|---|---|---|
| llm.classify_and_build, llm.suggest_framework, llm.estimate_hours | DS-12 / DS-13 | Sonnet 5 |
| brain.routine, chat.public_lead, ledger.classify_message, faq.reword_answer, plan.business_plan, design.direction | DS-14 / DS-12 / DS-13 / DS-11 | Sonnet 5 |
| brain.high_stakes | DS-02 | Opus 5.5, under a standing DS-02 approval recorded in `operations.ts` |

**For Virat to confirm:** `brain.high_stakes` keeps the pre-existing behaviour (Opus 5.5 for high-stakes Brain questions) through a minimum tier of `elite` and a standing approval written in the registry. It is a decision recorded in code, not an agent approving itself; lower or remove it there if Sonnet under human review is enough. Task profiles in `operations.ts` are my reading of each call site (for example, human review is claimed only where the code shows an admin or review queue); review them.

**Limits, stated plainly.**
- "Available" means configured, not probed. Nothing checks the provider at runtime, so a retired model would fail at the API, not at the gate.
- When Haiku is added to `PROVIDER_CONFIGURED_MODEL_IDS`, human-reviewed simple tasks (for example `ledger.classify_message`) route to it automatically. That is tested but not enabled.
- Tokens and cost are not captured: the callers read the response body, and the provider does not. Attribution records operation, agent, model, tier, duration and status only.
- Ceilings are per call and per request (retry count, round count, runaway limits). There is no cross-request or daily spend cap. The public chat endpoint also has no per-client rate limit, so total spend there is bounded per request, not overall.

## Model Learning

Source: `src/lib/intelligence/model-learning.ts`.

Observation structure: task type → model → quality result → cost → human correction → business outcome. Summarisation produces recommendations (sufficient / consider_downgrade / consider_upgrade / insufficient_data) after 10+ observations. **Does NOT silently change model policy.** A model-policy change requires governance approval.

## What is NOT implemented

- Actual provider API calls or model switching
- Token counting or billing integration
- Runtime model availability detection
- Automatic quality checking and escalation loops
- Human review cost measurement
- Workforce-cost engine
- Full economic attribution system
- Live model learning pipeline (observation structure exists; collection does not)

These are documented requirements, not claims of implementation.

---

## Visual Design & Brand Guardian (DS-16 Guard)

Status: **CODE COMPLETE** (agent definition, review contract, platform compliance checks). No live review engine.

### Agent passport

| Field | Value |
|---|---|
| ID | DS-16 |
| Name | Guard |
| Role | Specialist |
| Reports to | DS-11 Grow (CMO function) |
| Purpose | World-class visual QA and preservation of brand and platform standards |

### Authority

**Can**: inspect, reject, require revision, approve, identify brand drift, identify platform drift, identify product fidelity defects, identify technical visual defects, create Work items for material problems.

**Cannot**: rewrite Brand Foundation, rewrite Brand Book, change positioning, change pricing, change marketing budget, approve legal claims, override the Founder, publish outside existing release authority.

### Release gate

DRAFT → DESIGN REVIEW → REVISION REQUIRED / PASS → APPROVED FOR RELEASE

Critical or major defects block release. Founder override must be explicit and auditable.

### World-class quality benchmark

"Would this be credible as work produced by a top-tier global creative/design studio?"

15 quality dimensions assessed. 12 automatic rejection criteria (generic AI aesthetics, fake text, distorted logos, etc.).

### Platform compliance

Every operating surface is checked for:

1. ViratMohan.com signature colour line (`.vm-band`)
2. Platform typography (tokens.css fonts)
3. Breadcrumbs
4. Mobile usability
5. 44px touch targets
6. No horizontal overflow
7. Navigation hierarchy
8. Brand content within the platform system

A dashboard that is beautiful but breaks ViratMohan.com platform identity is: **REVISION_REQUIRED**.

### Creative asset lineage

Where existing systems support it: Asset ID, brand, product/SKU, campaign, source assets, prompt, Brand Foundation version, Brand Book version, generated asset, reviewer, review status, revision history, approved version, downstream performance. Uses the existing Asset Library — no second asset database.

### Work Registry integration

Material creative/brand problems (wrong logo, wrong product, serious Brand Book violation, serious platform-brand violation, broken public campaign, critical visual defect) may become Work items. Not every subjective design preference.

---

## ViratMohan.com Master Platform Identity

**Permanent rule**: every dashboard, Command Centre and operating surface is a ViratMohan.com surface.

### Platform hierarchy

VIRATMOHAN.COM → DEVSHOP → RETAIL OS → BRAND

Individual brands use their own colour systems inside the brand experience. They cannot replace the master platform signature line.

### Signature colour line

The four-swatch colour band at the top of ViratMohan.com interfaces:

| Swatch | Colour | Hex |
|---|---|---|
| 1 | Gold | #d4af37 |
| 2 | Magenta | #e91e8c |
| 3 | Cobalt | #3e6fa6 |
| 4 | Terracotta | #d9714b |

CSS class: `.vm-band` (5px) / `.vm-band--hero` (10px). Source: `/brand/tokens.css`.

### Current status

- `.vm-band` exists in tokens.css and is used on: dashboard, mission, ops pages, lead shell.
- All 14 `retail-os/admin` pages carry `.vm-band` (INTEGRATION VERIFIED by grep; no browser check at 390px/1280px has been run, so mobile rendering is NOT VERIFIED).
- Brand-owned storefronts live in separate repos and are outside this check.

### Dashboard permanent UX standard

Every Founder and Brand Dashboard must preserve: ViratMohan.com branding, canonical signature colour line, breadcrumbs, genuine mobile usability, responsive layout, 44px touch targets, no horizontal overflow, clear navigation hierarchy.
