# DevShop Improvement System

Status: **CODE COMPLETE and TESTED** (deterministic contract only — no live automation, no autonomous change).

**Not autonomous self-modification.** The Improvement System proposes, records and tracks changes; it does not apply any. Approving a change, and every change to Brand Foundation, the Brand Book, authority, model policy, financial controls, production architecture, compensation or company policy, stays with the people named in `learning.ts` (`PROTECTED_DOMAINS`, Founder approval). Nothing detects or closes the loop on its own yet (see "What is NOT implemented").

## What it is

A closed-loop improvement mechanism: DETECT → UNDERSTAND → ROOT CAUSE → IMPROVE → IMPLEMENT → VERIFY → STANDARDISE → LEARN → PREVENT RECURRENCE.

It extends the Work Registry — an Improvement references a Work item, it does not replace it. There is no second ticket system.

## Process Efficiency Agent (DS-17 Improve)

| Field | Value |
|---|---|
| ID | DS-17 |
| Name | Improve |
| Role | Specialist |
| Reports to | DS-02 Dev (CEO) |
| Purpose | Continuous improvement of DevShop processes, agents, models and operations through detection, root cause analysis, change control and prevention |

### Authority

**Can**: detect improvement signals, analyse recurrence, perform root cause analysis, propose changes, classify PTM, track improvement pipeline, verify outcomes, standardise prevention, create Work items.

**Cannot**: approve changes, modify Brand Foundation, modify Brand Book, modify model policy, modify authority levels, deploy to production, override the Founder, assign Prince work, send external communications, change prices or terms.

## Canonical Improvement Object

Source: `src/lib/improvement/types.ts`.

Every Improvement references a Work item (`work_id`). It carries:

- **Category**: process, agent, model, human, brand, visual, platform, integration, security
- **Status lifecycle**: detected → analysed → root_caused → proposed → approved → implementing → verifying → standardised → closed
- **Signal source**: incident, recurring_incident, health_check, audit, agent_detection, human_observation, metrics_drift, brand_review, visual_review, customer_feedback
- **Root cause**: summary, method (five_whys/fishbone/fault_tree/direct/other), depth, evidence, contributing factors
- **Recurrence**: pattern, occurrence count, first/last seen, interval average, linked work IDs
- **Change proposal**: before/after, risk, reversibility, affected systems/agents/brands, approval status
- **Benefits**: type (time_saved/error_reduction/cost_reduction/quality_improvement/risk_reduction/revenue_impact), estimated and measured values
- **Before/after evidence**: dimension, before, after, measured flag
- **PTM classification**: process, training, mapping (actor/tech role/human role), automation level, complexity
- **Prevention**: action, standardised flag, linked work ID
- **Verification**: method, evidence, verified by, verified at
- **Learning**: reuses the Work Registry's `Learning` interface (lesson, reference, rule_added)

## Function → Process → Task hierarchy

Source: `src/lib/improvement/types.ts`.

Nine organisational functions: operations, growth, finance, sales, quality, customer_care, team, visual, brand.

Each Function contains Processes. Each Process contains Tasks. Each Task carries an `AutomationLevel` (reused from `src/lib/amc.ts`: fully_automated, human_in_loop, human_reviewed, advisory_only).

## M/A/SA/F automation classification

Reuses `AutomationLevel` from `src/lib/amc.ts`. Mapping to the PTM shorthand:

| Code | AutomationLevel |
|---|---|
| F | fully_automated |
| A | human_in_loop |
| SA | human_reviewed |
| M | advisory_only |

## Recurrence detection

Source: `src/lib/improvement/detection.ts`.

Threshold: 2+ occurrences of the same fingerprint or brand pattern. Calculates average interval in days. Extends the existing coordinator.ts detection (which flags 2+ incidents per brand) with structured tracking.

## Root cause analysis

Source: `src/lib/improvement/detection.ts`.

Methods: five_whys, fishbone, fault_tree, direct, other. Requires: summary, depth ≥ 1, at least one evidence ID. Contributing factors are tracked separately.

## Governance

Source: `src/lib/improvement/governance.ts`.

### CEO review required for:
- Categories: model, security, platform
- Priorities: P0, P1
- High-risk or irreversible change proposals

### Myoho review required for:
- Categories: brand, visual
- Process changes affecting brands

### Founder approval required for:
- Irreversible changes
- High-risk changes

### Status transitions

| From | Valid transitions |
|---|---|
| detected | analysed |
| analysed | root_caused, proposed |
| root_caused | proposed |
| proposed | approved, closed |
| approved | implementing |
| implementing | verifying |
| verifying | standardised, implementing (rework) |
| standardised | closed |
| closed | (terminal) |

Approval required before: `approved` and `implementing`.

## Improvement categories

| Category | Covers |
|---|---|
| process | Operational workflows, SOPs, checklists |
| agent | Agent behaviour, coordination, decision quality |
| model | Model routing, intelligence governance, quality |
| human | Workforce skills, training, capacity |
| brand | Brand voice, identity, drift |
| visual | Design quality, creative assets, platform compliance |
| platform | Dashboard, admin, Retail OS surfaces |
| integration | APIs, webhooks, third-party connections |
| security | Auth, permissions, vulnerabilities |

## Improvement Learning

Source: `src/lib/improvement/learning.ts`.

Learning states: OBSERVATION → HYPOTHESIS → VALIDATED LEARNING → RULE.

Only validated learnings with evidence can become rules. Only approved rules are authoritative.

### Protected domains (cannot be silently modified by learning)

brand_foundation, brand_book, company_policy, authority, model_policy, compensation, financial_controls, production_architecture.

Changes to protected domains require Founder (DS-00) approval. Routine rules need only CEO (DS-02) approval.

### Integration with Work Registry

`toLearning()` converts a rule-state `ImprovementLearning` into the Work Registry's `Learning` interface (lesson, reference, rule_added), so improvements feed back into the existing learning system on every Work item.

## What is NOT implemented

- Live automation of detect → improve → verify loop
- Autonomous change execution
- PTM runtime engine (classification types exist; no runtime)
- SOP management system
- Brand Memory
- Agent performance scoring or certification
- Improvement pipeline dashboard
- Metrics drift detection
- Benefit measurement automation
- Learning feedback into model routing

These are documented requirements, not claims of implementation.

## Integration points

- **Work Registry**: Improvement references Work items via `work_id`. Uses existing `Learning` and `IncidentPrevention` interfaces.
- **Model Router**: DS-17 has agent model defaults (Sonnet 5.5, escalates to Opus 4.7 / 5.5).
- **Visual Guardian**: Visual review is a signal source; brand/visual improvements trigger Myoho review.
- **CEO coordinator**: Existing recurring incident detection (coordinator.ts) is the starting point for structured recurrence tracking.
- **Priority policy**: `'improvement'` WorkType already classified by priority-policy.ts; improvements default to P4.
