# DevShop CEO operating model — architecture

The operating model defines how decisions flow from Virat through the organisation to execution and back to learning. This document records the architecture; it does not implement the full autonomous CEO.

## Decision chain

```
Virat (founder: money, people, promises)
  → DevShop CEO agent (DS-02 Dev: runs the organisation)
    → HOD / Specialist agents (Growth DS-11, Finance DS-13, etc.)
      → Brand CEO agents (TC-01 Trav, MG-01 Moon, CK-01 Cera, etc.)
        → Execution (autonomous within guardrails, or human via the Technical Deployment Officer, currently Prince Keshri)
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

The CEO operating layer is implemented in `src/lib/ceo/` (11 source files, 4 test files, 141 `node:test` tests via `npm run test:ceo`; plus Vitest schema, concurrency and lifecycle tests in `tests/unit/work` and 22 HTTP tests in `tests/integration`). Pure deterministic logic — no AI invocations, no framework, no network.

### What exists (`src/lib/ceo/`)

| File | What it does |
|---|---|
| `types.ts` | Agent registry (14 agents), autonomy model (15 grants), communication context types, question model, morning board types, audit categories, tech cost guardrails |
| `coordinator.ts` | Request classifier, owner determination, duplicate detection, audit loop (blocked/overdue/recurring/security), question routing and lifecycle |
| `morning-board.ts` | Material-exceptions-only view: critical incidents (P0/P1), pending approvals, blocked work (≥1 day), overdue, unassigned past triage |
| `founder-input.ts` | Canonical founder → CEO input representation. Classifies text into 8 kinds (context, question, instruction, approval, decision, work_request, evidence, relationship) with urgency detection |
| `context-pack.ts` | Deterministic, bounded context assembly. Relevance-driven: morning board only for status queries, related work by brand/text, brand summary, pending approvals for approval inputs. Bounded to 10 related items, 5 recent decisions, 20 audit findings |
| `authority.ts` | Authority check against the autonomy model. Maps input kind → required capability → autonomy grant → allowed/denied with holder. Assignment guard is role-based: the `assign-work` grant lists `restrictedRoles`, matched against the role holders in `roles.ts`, so changing who holds a role is configuration, not code. Approval authority resolution |
| `response.ts` | Structured CEO response model. Produces operating decisions (act, recommend, escalate, answer, acknowledge, delegate, attach_to_work) with selected owner, required approval, related work, delegation target and next step |
| `roles.ts` | Role → current holder configuration (`ROLE_BINDINGS`). Today one role: `technical_deployment_officer`, sole human holder Prince Keshri, governed by Dev (DS-02); assignment needs Virat (`prince_assignment`). Also the deterministic function classifier |
| `founder-service.ts` | Server-side handler for the Founder Command Centre: admin auth, input validation, load registry, run orchestrator, persist only if something changed, return a structured response |
| `orchestrator.ts` | `processFounderInput(input, registry)`: classify, bounded context, authority, response, then a Work Registry mutation only where authorised. Reuses existing Work before creating; attaches evidence; escalates anything L4 or unassignable. Nothing external is executed |
| `index.ts` | Re-exports |
| `ceo.test.ts` | 31 tests across 10 scenarios (simple task, technical issue, question routing, blocked work, approval, duplicates, cross-brand patterns, recurring problems, cost guardrails, morning board) |
| `runtime.test.ts` | 39 tests across 4 suites (founder input classification, authority checks, context pack, CEO response) |

### CEO autonomy grants (as coded)

| Capability | Level | Holder |
|---|---|---|
| create-work | L2 | DS-02 (no priority limit) |
| assign-work | L2 | DS-02 |
| triage-work | L2 | DS-02 |
| prioritise-work | L1 | DS-02 (judgement above the rules is a recommendation) |
| apply-priority-rules | L3 | DS-02 (the deterministic priority rules, P0 included) |
| escalate-work | L2 | DS-02 |
| monitor-work | L3 | DS-02 |
| detect-exceptions | L3 | DS-02 |
| coordinate-agents | L2 | DS-02 |
| report-to-founder | L2 | DS-02 |
| approve-spend | L4 | DS-00 (Virat) |
| approve-pricing | L4 | DS-00 |
| approve-outbound-comms | L4 | DS-00 |
| approve-restricted-assignment | L4 | DS-00 (approval to assign a restricted role) |
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

The Founder Control Tower page (`/retail-os/admin/control-tower`) reads the real Work Registry from the control-plane Supabase database. Its four views are read-only; the one writing path is the Ask the CEO tab, which goes through the CEO runtime. The views do not create, modify or close work, does not route agents, does not send communications, does not remediate, does not approve spend. Its data source is the control-plane Work Registry via `loadRegistry()` → `createSupabaseWorkStore()` → Supabase. Server-side only (no service-role key in the browser). Protected by admin auth middleware.

Five tabs: Morning Board (material exceptions from `buildMorningBoard()`), Work Pipeline (eight-stage view from `buildControlTowerView()`), Agents (registry, autonomy grants), Brands (portfolio with honest status), Ask the CEO.

### CEO runtime foundation (implemented, not wired to live systems)

The runtime foundation provides the context and decision structure for CEO operations without autonomous execution:

1. **Founder input classification** (`founder-input.ts`): text → 8 canonical kinds with urgency, brand scope, work association. Not every message creates work.
2. **Context pack** (`context-pack.ts`): assembles bounded, relevance-driven context (morning board, related work, brand summary, audit findings, pending approvals, active locks). Does NOT load everything.
3. **Authority check** (`authority.ts`): maps any action to the autonomy model and determines CEO authority (L0–L4). Assignment to a restricted role needs approval. Unknown capabilities default to L4 (human decision).
4. **Structured response** (`response.ts`): produces operating decisions (act/recommend/escalate/delegate/acknowledge) with owner, approval requirements, related work and next step. No execution — context and decision only.

**Not connected**: email sending, WhatsApp sending, production deployment, financial approvals, spend, legal commitments, external communications, irreversible actions. The runtime foundation is the context/decision layer; execution is future work.

### Runtime to Work Registry (orchestrator)

`processFounderInput` is the only path from a founder input to a registry mutation. Order: build context, check authority, look for existing Work, then act. Mutations it can make: create a Work item (L2 `create-work`), attach evidence. Approvals, spend, pricing, outbound comms, terms and restricted-role assignment are returned as escalations to the holder named in the grant; the orchestrator never records them itself. Created Work shows in the Control Tower through the normal registry. 9 tests in `orchestrator.test.ts`. Not wired to any live channel; nothing is sent or deployed.

### Technical Deployment: role and holder (implemented now)

```
CTO governance (Dev, DS-02, until a CTO agent exists in the registry)
  → Technical Deployment Officer (role: technical_deployment_officer)
    → Prince Keshri (current and sole human holder)
```

Prince Keshri is the sole current human Technical Deployment Officer. The role is the routing abstraction; the holder is organisational configuration (`ROLE_BINDINGS` in `roles.ts`). Generic CEO code (authority, orchestrator, coordinator, response, context pack, founder service) names no person and has no `isPrince()` exception; a test scans for it. Replacing the holder is an edit to `ROLE_BINDINGS`, and a test proves routing, assignment approval and question routing follow it.

Authority is unchanged: the `assign-work` grant restricts assignment to `restrictedRoles: ['technical_deployment_officer']`, and assigning that role needs Virat's approval (`prince_assignment`). The CEO opens the Work, owns it as governance, and requests Virat's approval. Only when Virat approves does the orchestrator assign the role holder, acting on his approval. The Work Registry core also keeps its own rule that Prince is only ever assigned by Virat (`validateOwner`). Questions for the function route to the current holder as records only; nothing is delivered to anyone.

### Founder Command Centre → CEO runtime → Work Registry → Control Tower (implemented now)

```
Control Tower page, "Ask the CEO" tab (/retail-os/admin/control-tower?tab=ceo)
  → POST /retail-os/api/admin/ceo-input   (admin password; service-role access stays server-side)
  → founder-service.ts → orchestrator.ts → Work Registry (load, mutate, persist only on change)
  → structured response; resulting Work shows in the Work Pipeline tab
```

The response shows what the CEO understood, authority, matched Work, routing, required approval, escalation, next step and an audit trail. What the runtime does:

- Status and context questions read only. Greetings and FYIs change nothing.
- Work requests and instructions look for existing Work first (see Work matching below: the referenced Work, else a strong match, else ask when ambiguous, never a brand-wide guess). A match is reused and the founder input is logged on it; otherwise Work is created, triaged by the priority rules and assigned to the brand CEO or Dev.
- Evidence is attached to the referenced Work. A founder decision is logged on matched Work through the registry's audit trail. There is no second decision ledger; a decision with no Work to attach to is not recorded and says so.
- Approval records Virat's decision through `decideApproval` when exactly one approval is pending or a Work reference is given; with several pending it asks rather than guesses.
- Every material step is a registry event (append-only, hash-chained), including one `action` event carrying the founder input, authority rule, matched Work, routing and result.
- Input from anyone other than the Founder principal is refused with no change.

Not wired to any live channel and no external execution. Founder Input does not send, deploy, spend or contact anyone.

### Verification status (read this before relying on any of it)

**Implemented and verified end to end (local, real code paths).** `npm run test:integration` starts the real Astro server and sends real HTTP to `/retail-os/api/admin/ceo-input`. The real route, middleware, handler, CEO runtime, Work Registry store and `supabase-js` client run unchanged. Only the network endpoint is swapped for a local PostgREST-compatible shim over embedded Postgres executing the real migration 0055 (constraints, hash-chain trigger, no-delete trigger included). 11 tests: authentication (no credentials, wrong user, wrong password), validation (malformed, empty, oversized, unknown brand, unknown Work reference), Work creation persisted and read back, no write on a status question, no attachment to unrelated Work and attachment on an explicit reference, reuse on repeat, the technical deployment approval gate and assignment to the role holder, the real Control Tower page showing the Work and the pending approval, and two concurrent requests. Phone (390px, mobile emulation) and desktop (1280px) checks of the Morning Board and Work Pipeline on that data: no sideways scroll, 44px tap targets, breadcrumbs intact.

**NOT verified against the real Supabase project.** This session had no Supabase credentials. A read-only check of the live control plane confirmed the five Work tables exist with row-level security on and 0 rows (migration 0055 is applied; the Control Tower there is genuinely empty). No Founder request has been run against it. `npm run verify:ceo-live` does it, only when `CEO_LIVE_VERIFY=yes` and credentials are set, and writes one `[IT-LIVE]` item. The schema forbids deleting Work, so that item cannot be cleaned up; Virat would close or resolve it. Run it deliberately.

**Implemented but unit-tested only.** The role and holder model, authority limits, question routing, and the 112 `node:test` CEO tests (in-memory registry).

**Concurrency and atomicity: IMPLEMENTED and SCHEMA-VERIFIED, not live.** A logical write is one call to `work_persist` (migration 0056, `case-study/WORK-REGISTRY.md`, "Transactional persistence"): all its changes commit or none do, a stale item is refused under a row lock, duplicates are refused by the database's unique keys, and `mutateRegistry` retries on fresh state up to 3 times (the endpoint then answers 409). Each of these is tested on the real schema: stale and concurrent writers, lock release against lock update, concurrent links, duplicate reports, a failed write leaving no partial state, and audit integrity. The earlier races (item row without events, item row updated after events, check and write as separate statements) no longer exist for writes that go through `work_persist`. Remaining: the migration is not applied to the live control plane and the code must not be deployed before it is; the row lock between truly parallel transactions is not exercised locally (embedded Postgres is one connection); every request still loads the whole registry (reads are unchanged); source events, links and locks are written only when new or changed.

**Priority.** `apply-priority-rules` (L3) turns the request into the registry's own risk factors by explicit rules and `suggestPriority` gives the level. Creating Work never limits severity. Rule floors: a money path (checkout, payments, gateway, cart, orders, store, site) failing is P0; a production outage is P0; a security compromise is P0 and an exposure P1; customers directly affected (charged twice, unable to pay or order, wrong item, not received) is P1. A request about a rate, report, metric, cost, budget or audit is not an incident. Improvement words (improve, enhance, polish, tidy, refactor, redesign) make an improvement at P4; everything else is P3. An explicit Founder priority ("make it P1") is applied in either direction and recorded as his instruction with what the rules would have given. Urgent wording that matches no rule is held at the rule priority and returned as an advisory that needs Virat ("reply make it P1"); nothing is silently raised or lowered. The factors, basis and reason go on the item and into its audit trail. Rules are in `priority-policy.ts`.

**Work matching.** Order: explicit Work reference (always wins); otherwise the same subject words after brand names, generic words and tags are removed (exact); at least two shared subject words and 60% of all subject words in common (strong); or the same deployment target in the same brand (context). Anything weaker is not attached and is listed as similar Work. Two or more strong candidates are ambiguous: the CEO asks for the Work reference and writes nothing. A missed match costs a duplicate to merge; a wrong match is an operational mistake, so it errs towards missing. Closed and merged Work and other brands' Work never match; at most 300 recent open items are scanned. In `work-matcher.ts`.

**Technical deployment routing.** Decided from the requested action, the target system and the production context together (`deployment-intent.ts`): a setup verb with a target (DNS, domain, SSL, webhook, API key, SMTP, gateway, Razorpay, Shiprocket, Shopify, Vercel, Supabase, hosting, server, CDN, database), or a deploy or release verb with a target or production or staging. A request led by an analysis verb (review, analyse, compare, audit, explain, why) or about costs, reports, campaigns or performance does not qualify. "Integration" alone never qualifies. A question qualifies only if it asks about a deployment target. Qualifying work: Work opened, owned by Dev as governance, Virat's approval requested (`prince_assignment`), the Technical Deployment Officer (currently Prince Keshri, the sole holder) assigned only after he approves. The structured basis is on the response and the audit line.

**Behaviours to know.**
- Approval from the Founder interface is approve-only. The registry's `decideApproval` supports rejection with a note, but there is no safe way to tell a rejection from other text yet, so it is not wired.
- A policy decision with no Work is acknowledged, not persisted. The registry has no decision ledger and none was invented.
- A report of a recognised critical condition ("the checkout is down") is classified as a work request even without an action verb; "Check why the checkout is broken" stays an investigation instruction; a question stays a question and never creates Work.
- Every response that wrote carries a `write` record (operation, actor, source channel, authority basis, resulting state, audit events). Reads and clarifications carry none.
- The `ref` in a response is provisional until the Work is reloaded; the database generates the canonical one.

**Live Supabase verification procedure (not yet run).** First apply `migrations/0056_work_persist.sql` to the control plane by hand. Then `CEO_LIVE_VERIFY=yes SUPABASE_URL=https://vszjwgxvqoqyixpfthwl.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run verify:ceo-live`. It exits 2 and writes nothing unless `CEO_LIVE_VERIFY=yes`, both variables are set, and the URL is the control-plane project (a brand database is refused). It sends one Founder request titled `[IT-LIVE] Verify the CEO runtime write path <date>` through the same handler, reads it back, checks the audit chain and Control Tower visibility, then closes it through the lifecycle (resolve, verify, close) and checks that the title, the earlier history and its place in the Control Tower are kept. Exit 0 only if all hold. Until it has run against the real project, live Supabase is not verified.

**Closing the [IT-LIVE] item.** Work is never deleted, so the record stays, closed. The verification script closes it itself. To close one by hand: `POST /retail-os/api/admin/work-lifecycle` with the admin password and `{"work":"W-####","action":"close_test_record"}`. It works only on titles starting `[IT-LIVE]` or `[IT-TEST]`, writes the resolve, verify and close events atomically (resolved by the owner on the Founder's instruction, verified and closed by Virat), keeps the marker and every earlier event, and touches no other Work. Closed Work is counted under Learn in the Control Tower pipeline.

**Verification tiers.**
- LIVE VERIFIED: none. The live control plane was only inspected read-only (five Work tables, row-level security on, zero rows). Migration 0056 is not applied there.
- INTEGRATION VERIFIED (real Astro server, real routes, real supabase-js, real migrations 0055 and 0056 in embedded Postgres): authentication, validation, creation and read-back, no write on reads, matching and ambiguity, P0 appearing as Critical on the Morning Board and pipeline, the deployment gate and assignment, concurrent requests, the lifecycle endpoint (start, resolve, verify, close, close of a test record, illegal moves) with each state in the Control Tower, phone and desktop layout. 22 tests.
- SCHEMA VERIFIED (real 0055 and 0056, embedded Postgres): `work_persist` atomicity, rollback and least privilege (14 tests), concurrency (13), lifecycle service and approvals (15).
- UNIT TESTED: priority rules, matcher, deployment intent, role and holder model, authority, and the 141 `node:test` CEO tests.
- NOT IMPLEMENTED: approval rejection; workless policy decisions (no decision ledger); a Control Tower close button (closing is the lifecycle endpoint); WhatsApp or email into the CEO; external execution; autonomous material execution.

### What does NOT exist yet

- WhatsApp → CEO and Email → CEO (the only entry today is the Control Tower tab)
- External execution adapters and autonomous material execution
- Rejecting an approval from the Founder interface (approve only)
- A standalone place for policy decisions with no Work
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
