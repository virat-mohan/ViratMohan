# Agent Organisation: Status & Gap List

As of 9 Oct 2026. Branch: `claude/laughing-gates-hgqo0o`.

Legend:
- **TESTED** — unit tests exist and pass
- **DB_CONNECTED** — code reads/writes Supabase tables (requires migration applied)
- **RUNTIME_VERIFIED** — tested through the actual API endpoint path
- **GAP** — not yet built or tested

## Core Infrastructure

| Component | Status | Files | Notes |
|-----------|--------|-------|-------|
| Work Registry | TESTED, DB_CONNECTED | `src/lib/work/`, `migrations/0055_work_registry.sql` | 37+ tests, full lifecycle |
| Agent Registry (17 agents) | TESTED | `src/lib/ceo/types.ts` | AGENT_REGISTRY, autonomy model |
| Certification system | TESTED | `src/lib/ceo/agent-training.ts` | 6 cert levels, 52 assessment scenarios |
| Certification gate in delegation | TESTED, RUNTIME_VERIFIED | `src/lib/ceo/authority.ts`, `orchestrator.ts` | canCeoAssign blocks uncertified agents |
| Brain / persistent memory | TESTED, DB_CONNECTED | `src/lib/brain/store.ts`, `src/lib/ceo/brain-context.ts` | Requires brain tables |
| CEO orchestrator | TESTED | `src/lib/ceo/orchestrator.ts` | 27 orchestrator tests + 16 runtime tests |
| Founder input classifier | TESTED | `src/lib/ceo/founder-input.ts` | Deterministic, no AI |
| People OS (worker actions) | TESTED, RUNTIME_VERIFIED | `src/lib/ceo/people-action.ts`, `people.ts` | accept, blocker, complete flow |
| Extended context assembly | TESTED | `src/lib/ceo/ceo-context-extended.ts` | Agents, humans, brands, decisions |
| Channel adapter | TESTED | `src/lib/ceo/channel-adapter.ts` | Command centre: connected; email/WhatsApp: SETUP_REQUIRED |
| DB stores (decisions, onboarding, dashboards, training) | TESTED, DB_CONNECTED | `src/lib/ceo/db-stores.ts` | Requires migration 0057 |
| CEO API endpoint | TESTED, RUNTIME_VERIFIED | `src/pages/retail-os/api/admin/ceo-input.ts` | Loads all stores, graceful degradation |
| People action API endpoint | TESTED | `src/pages/retail-os/api/admin/people-action.ts` | Admin auth gated |
| Improvement system types | TESTED | `src/lib/improvement/types.ts` | PTM, detection, learning types |
| Improvement detection | TESTED | `src/lib/improvement/detection.ts` | Pattern detection from work items |
| Control Tower view | TESTED | `src/lib/control-tower/view.ts` | Pipeline/stage projection |
| Priority policy | TESTED | `src/lib/ceo/priority-policy.ts` | P0-P4 with factor analysis |
| Roles & deployment intent | TESTED | `src/lib/ceo/roles.ts`, `deployment-intent.ts` | Prince routing |

## Per-Agent Assessment Coverage

| Agent | ID | Role | Training Modules | Scenarios | Passport | Status |
|-------|-----|------|-----------------|-----------|----------|--------|
| Virat | DS-00 | founder | N/A | N/A | N/A | Human, not an agent |
| Myoho | DS-01 | guardian | GD-01 | GD-A01 (1) | TESTED | GAP: needs more governance scenarios |
| Dev | DS-02 | ceo | CEO-01..04 | CEO-A01..A04 (4) | TESTED | TESTED, RUNTIME_VERIFIED |
| Moon | MG-01 | brand_ceo | BC-01..04 | BC-A01..A04 (4) | TESTED | GAP: no brand-specific runtime tests |
| Trav | TC-01 | brand_ceo | BC-01..04 | BC-A01..A04 (4) | TESTED | GAP: no brand-specific runtime tests |
| Cera | CK-01 | brand_ceo | BC-01..04 | BC-A01..A04 (4) | TESTED | GAP: no brand-specific runtime tests |
| Paws | FP-01 | brand_ceo | BC-01..04 | BC-A01..A04 (4) | TESTED | GAP: not live yet |
| Kor | KB-01 | brand_ceo | BC-01..04 | BC-A01..A04 (4) | TESTED | GAP: not live yet |
| Check | DS-10 | hod | HOD-01, QA-01 | QA-A01, HOD-A01 (2) | TESTED | GAP: no health-check-to-work-item flow test |
| Grow | DS-11 | hod | HOD-01, CMO-01..02 | CMO-A01..A03, HOD-A01 (4) | TESTED | GAP: no campaign attribution test |
| Deal | DS-12 | hod | HOD-01, CSO-01 | CSO-A01..A02, HOD-A01 (3) | TESTED | GAP: no pipeline forecast validation |
| Books | DS-13 | hod | HOD-01, CFO-01..02 | CFO-A01..A03, HOD-A01 (4) | TESTED | GAP: no P&L calculation end-to-end test |
| Care | DS-14 | hod | HOD-01, CCO-01 | CCO-A01, HOD-A01 (2) | TESTED | GAP: no WhatsApp integration (SETUP_REQUIRED) |
| Crew | DS-15 | hod | HOD-01, CHRO-01..03 | CHRO-A01..A09, HOD-A01 (10) | TESTED | GAP: performance dimension scoring not implemented; incentive flow not implemented |
| Guard | DS-16 | specialist | SP-01 | GRD-A01 (1) | TESTED | GAP: no multimodal visual audit capability |
| Improve | DS-17 | specialist | SP-01, IMP-01 | IMP-A01..A02 (2) | TESTED | GAP: no recurring pattern detection end-to-end |
| Prince | P-01 | human | N/A | N/A | N/A | Human. People OS tracks his work. TESTED |

## CHRO (DS-15) Expanded Spec

| Requirement | Status |
|-------------|--------|
| Access matrix: least-privilege, purpose-bound | TESTED (CHRO-A07 scenario, access policy in training) |
| Sensitive data categories (medical, religion/caste/ethnicity/orientation, personal comms, devices, secrets, bank details, ID images, unrestricted payroll, confidential legal) | TESTED (CHRO-A07 refusal scenario) |
| Authority: CHRO recommends only (L1) | TESTED (`canExerciseAutonomy` with CERTIFIED_L1 gate) |
| Human-approved decisions: hiring, termination, pay, bonuses, promotions, discipline, policy changes, sensitive complaints | GAP: no explicit authority gate per action type (covered by L4 → Virat for money/people/promises) |
| Performance dimensions (delivery/SLA 25, quality 25, productivity 15, ownership 15, collaboration 10, learning 10) | GAP: dimensions defined in CHRO-A03 scenario description; scoring function not implemented |
| External waiting time exclusion | TESTED (CHRO-A04 scenario) |
| Incentive flow: CHRO → functional manager → CFO → CEO → Virat | TESTED (CHRO-A06 scenario) |
| Reporting: daily/weekly/monthly | GAP: reporting cadence not implemented |
| 9 assessment scenarios | TESTED (CHRO-A01..A09) |
| Stage: Virat proposes Stage 3 | Maps to our Stage 2 (CHRO under Crew, after Dev operational). Discrepancy: Virat's Stage 3 "Managed Operations and People Intelligence" is broader — includes Books and Improve. Our Stage 2 has Crew alongside Myoho and Check. **Recommendation:** keep Crew at Stage 2 (People OS is already partially built), move the intelligence features (performance scoring, incentive flow) to Stage 3. |

## Cross-Brand Access Rejection

| Test | Status |
|------|--------|
| Brand CEO scoped to own brand only | TESTED (AGENT_REGISTRY scope field, `brandCeoFor()`) |
| Cross-brand access rejection | GAP: no explicit test that MG-01 cannot act on `caps` work items |
| Superuser shortcut prevention | GAP: no test (policy in CLAUDE.md, not code-enforced) |

## Dashboards & Surfaces

| Surface | Status |
|---------|--------|
| Founder Command Centre (`/retail-os/admin/control-tower.astro`) | DB_CONNECTED (loads decisions, onboarding, dashboards, certifications) |
| Agent Organisation dashboard | GAP: no dedicated agent org view in the command centre |
| CEO / Improvement dashboard | GAP: improvement pipeline not rendered |
| Cost and usage per execution | GAP: no agent_executions table or tracking |
| Org board (`/retail-os/admin/org`) | Exists (org_members, org_updates tables) |

## Durable Execution: CEO → Work Registry → Job → Specialist → Result → CEO

| Step | Status |
|------|--------|
| CEO creates work item | TESTED, RUNTIME_VERIFIED |
| Work assigned to specialist agent | TESTED (orchestrator workFlow, certification gate) |
| Specialist executes and records result | GAP: no agent execution runtime (cloud sessions cannot message back) |
| Result stored in database | GAP: needs agent_executions or work evidence path |
| CEO reads result from database | Partial: CEO reads work items and evidence, but no structured execution result model |
| End-to-end loop | GAP: the loop is designed (Work Registry lifecycle) but not runtime-verified as a durable execution |

## Migrations

| Migration | Status |
|-----------|--------|
| 0055_work_registry.sql | Exists, not applied to production. Prince deploys on Virat's approval |
| 0057_agent_training_people.sql | Exists, not applied to production. Prince deploys on Virat's approval |

## Test Counts

- CEO integration tests: 181 (8 test files)
- Work Registry tests: 37+ (boundary, lifecycle, persistence)
- Total unit tests: 1300 (92 test files)
- All passing as of this commit.

## What Deploys

Nothing deploys to production from this branch. Migration 0057 and runtime activation stay with Prince on Virat's approval. See `case-study/DEPLOYMENT-REQUIREMENTS.md`.
