# DevShop CEO operating model — architecture

The operating model defines how decisions flow from Virat through the organisation to execution and back to learning. This document records the architecture; it does not implement the full autonomous CEO.

## Decision chain

```
Virat (founder: money, people, promises)
  → DevShop CEO agent (DS-02 Dev: runs the organisation)
    → HOD / Specialist agents (Growth DS-11, Finance DS-13, etc.)
      → Brand CEO agents (TC-01 Trav, MG-01 Moon, CK-01 Cera, etc.)
        → Execution (autonomous within guardrails, or human via Prince)
          → Verification (evidence in Work Registry)
            → Result (reported to founder@)
              → Learning (LEARNINGS.md, agent memory, process update)
```

## Agent autonomy levels

Autonomy belongs to a capability/action, not vaguely to an agent. Each action has one of:

| Level | Name | Description |
|---|---|---|
| L0 | Observe | Monitor and report only |
| L1 | Recommend | Propose action, wait for approval |
| L2 | Bounded execution | Act within explicit guardrails (budget cap, ROAS floor) |
| L3 | Autonomous | Act and report; escalate only on exceptions |
| L4 | Human decision | Only a named person can decide (money, terms, legal) |

Example: Travaholic CEO agent operates at L2 for ad budget (₹500/day cap, 4x ROAS floor), L3 for store fixes and content scheduling, L4 for price changes and new offers.

## Two Command Centres

| Surface | Scope | Technology | Owner |
|---|---|---|---|
| Brand Command Centre | One brand's operating overview | Next.js (per-brand repo) | Brand CEO agent |
| DevShop Founder Control Tower | All brands, all agents, all work, all decisions | Astro (ViratMohan repo) | DS-02 Dev / Virat |

These are distinct and must not merge.

## Performance evidence

Work Registry evidence (task completion, quality, timeliness, escalation patterns) supports a future CHRO People/Performance layer. The data model is the Work Item audit trail. The performance system is not built in this block.

## Responsible technology economics

Every operation uses technology responsibly:

1. **Deterministic when sufficient.** If a lookup, a formula or a template produces the right answer, do not invoke an LLM.
2. **Least expensive appropriate technology.** Use the smallest model that handles the task. Haiku for classification, Sonnet for generation, Opus for reasoning.
3. **No unnecessary LLM invocation.** Batch where possible. Cache where stable. Skip where redundant.
4. **Bounded retries.** Every automated action has a retry limit and a circuit breaker. No runaway loops.
5. **Attributable usage.** Every API call is tagged to a brand, a task and an agent so cost is traceable.
6. **Prevent runaway automation.** No agent can spend money, send customer messages, or modify production data without guardrails. L4 actions always require human approval.

## Implementation status

The CEO operating layer is implemented in `src/lib/ceo/` (8 source files, 2 test files, 70 tests). Pure deterministic logic — no AI invocations, no framework, no network.

### What exists (`src/lib/ceo/`)

| File | What it does |
|---|---|
| `types.ts` | Agent registry (14 agents), autonomy model (15 grants), communication context types, question model, morning board types, audit categories, tech cost guardrails |
| `coordinator.ts` | Request classifier, owner determination, duplicate detection, audit loop (blocked/overdue/recurring/security), question routing and lifecycle |
| `morning-board.ts` | Material-exceptions-only view: critical incidents (P0/P1), pending approvals, blocked work (≥1 day), overdue, unassigned past triage |
| `founder-input.ts` | Canonical founder → CEO input representation. Classifies text into 8 kinds (context, question, instruction, approval, decision, work_request, evidence, relationship) with urgency detection |
| `context-pack.ts` | Deterministic, bounded context assembly. Relevance-driven: morning board only for status queries, related work by brand/text, brand summary, pending approvals for approval inputs. Bounded to 10 related items, 5 recent decisions, 20 audit findings |
| `authority.ts` | Authority check against the autonomy model. Maps input kind → required capability → autonomy grant → allowed/denied with holder. Assignment guard is role-based: the `assign-work` grant lists `restrictedRoles`, matched through `actorCoversCoverage`, so changing who holds a role is configuration, not code. Approval authority resolution |
| `response.ts` | Structured CEO response model. Produces operating decisions (act, recommend, escalate, answer, acknowledge, delegate, attach_to_work) with selected owner, required approval, related work, delegation target and next step |
| `orchestrator.ts` | `processFounderInput(input, registry)`: classify, bounded context, authority, response, then a Work Registry mutation only where authorised. Reuses existing Work before creating; attaches evidence; escalates anything L4 or unassignable. Nothing external is executed |
| `index.ts` | Re-exports |
| `ceo.test.ts` | 31 tests across 10 scenarios (simple task, technical issue, question routing, blocked work, approval, duplicates, cross-brand patterns, recurring problems, cost guardrails, morning board) |
| `runtime.test.ts` | 39 tests across 4 suites (founder input classification, authority checks, context pack, CEO response) |

### CEO autonomy grants (as coded)

| Capability | Level | Holder |
|---|---|---|
| create-work | L2 | DS-02 |
| assign-work | L2 | DS-02 |
| triage-work | L2 | DS-02 |
| prioritise-work | L1 | DS-02 |
| escalate-work | L2 | DS-02 |
| monitor-work | L3 | DS-02 |
| detect-exceptions | L3 | DS-02 |
| coordinate-agents | L2 | DS-02 |
| report-to-founder | L2 | DS-02 |
| approve-spend | L4 | DS-00 (Virat) |
| approve-pricing | L4 | DS-00 |
| approve-outbound-comms | L4 | DS-00 |
| approve-prince-work | L4 | DS-00 |
| approve-terms-legal | L4 | DS-00 |
| approve-irreversible | L4 | DS-00 |

### Health → Work Registry → Founder Control Tower

The operational health visibility path:

```
scripts/health/check.mjs (runs every 2h)
→ POST /retail-os/api/health/report (Bearer CRON_SECRET)
→ stores in health_runs table
→ if failures: runHealthIngestion() → withRegistry() → ingestHealthRun()
→ Work Items created in Work Registry (type: incident, state: new, no owner)
→ Founder Control Tower reads via loadRegistry() → buildMorningBoard()
→ P0/P1 failures appear on Morning Board
```

Deterministic, idempotent, no LLM. Same check failing again attaches to the open item (fingerprint dedup). Recovery stops producing events but never auto-closes (a person resolves). Re-failure after close is flagged as a possible regression. The adapter never assigns, remediates, deploys or sends anything. 12 tests in `tests/unit/work/health-ingest.test.ts`.

### Founder Control Tower

The Founder Control Tower page (`/retail-os/admin/control-tower`) reads the real Work Registry from the control-plane Supabase database. It is read-only: it does not create, modify or close work, does not route agents, does not send communications, does not remediate, does not approve spend. Its data source is the control-plane Work Registry via `loadRegistry()` → `createSupabaseWorkStore()` → Supabase. Server-side only (no service-role key in the browser). Protected by admin auth middleware.

Four tabs: Morning Board (material exceptions from `buildMorningBoard()`), Work Pipeline (eight-stage view from `buildControlTowerView()`), Agents (registry, autonomy grants), Brands (portfolio with honest status).

### CEO runtime foundation (implemented, not wired to live systems)

The runtime foundation provides the context and decision structure for CEO operations without autonomous execution:

1. **Founder input classification** (`founder-input.ts`): text → 8 canonical kinds with urgency, brand scope, work association. Not every message creates work.
2. **Context pack** (`context-pack.ts`): assembles bounded, relevance-driven context (morning board, related work, brand summary, audit findings, pending approvals, active locks). Does NOT load everything.
3. **Authority check** (`authority.ts`): maps any action to the autonomy model and determines CEO authority (L0–L4). Assignment to a restricted role needs approval. Unknown capabilities default to L4 (human decision).
4. **Structured response** (`response.ts`): produces operating decisions (act/recommend/escalate/delegate/acknowledge) with owner, approval requirements, related work and next step. No execution — context and decision only.

**Not connected**: email sending, WhatsApp sending, production deployment, financial approvals, spend, legal commitments, external communications, irreversible actions. The runtime foundation is the context/decision layer; execution is future work.

### Runtime to Work Registry (orchestrator)

`processFounderInput` is the only path from a founder input to a registry mutation. Order: build context, check authority, look for existing Work, then act. Mutations it can make: create a Work item (L2 `create-work`), attach evidence. Approvals, spend, pricing, outbound comms, terms and restricted-role assignment are returned as escalations to the holder named in the grant; the orchestrator never records them itself. Created Work shows in the Control Tower through the normal registry. 9 tests in `orchestrator.test.ts`. Not wired to any live channel; nothing is sent or deployed.

### What does NOT exist yet

- Live wiring to email/WABA/WhatsApp routing
- Agent runtime (agents don't execute autonomously)
- Agent passport / credentials
- CRM, Economics/P&L, Growth Engine modules
- Full CHRO performance engine
- AI concierge or autonomous remediation
- Breadcrumbs and mobile-first responsive shell for Founder and Brand dashboards (implemented: `control-tower.astro`, `starters/next-brand-plane/components/Breadcrumbs.tsx`, `globals.css`)
- Autonomous agent execution runtime

## Brand data isolation

Each brand retains its own Supabase project and database. No multi-tenancy decision has been made. The Control Tower reads brand data through controlled APIs, never by direct database access.
