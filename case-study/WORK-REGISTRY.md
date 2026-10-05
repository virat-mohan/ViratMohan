# Work Registry: the one work system

**Rule for every future session: do not create a new ticket, task, request or incident system. If the Work Registry covers the need, use it. If it does not, extend it, and say what was missing.**

## Why

Work reaches DevShop through the Command Centre, brandsupport@, WhatsApp, founder requests, agent detections and system alerts. Without one place that resolves them, the same issue is tracked three times, nobody is clearly accountable, and Virat coordinates by hand. The Work Registry makes one issue one work item, with one accountable owner, a legal lifecycle, evidence, and an audit trail that cannot be rewritten.

Status: foundation built and tested, with the database-backed registry, the health-check ingestion adapter, and the **live health runner** that bridges `scripts/health/check.mjs` failures through the adapter into the DB-backed Work Registry. Migration `0055_work_registry` is **applied and tracked** in the Supabase migration ledger (`supabase_migrations`). **Nothing operational is connected yet**: no brand dashboard, WhatsApp, email, Control Tower routing or agent reads or writes it, and no live store or brand database changed. See "Database" and "Production safety".

## Where it lives (decision)

Checked against `ESTATE.md` and the anti-duplication rule. No new repository and no new package.

- **The contract and the rules** are `src/lib/work/` in `ViratMohan`, the control plane. They are pure: no Astro, no Supabase, no network, no import from outside the folder (a test enforces it). Lifting the folder into a shared package later is a file move.
- **The data model** is `migrations/0055_work_registry.sql` in the same repo. It is **applied** to the control-plane database `vszjwgxvqoqyixpfthwl` (5 tables, RLS on all, the append-only/chain/no-delete triggers, the generated `ref`). It was applied by hand through the SQL editor, and its ledger row was reconciled via `apply_migration` with a no-op `SELECT 1` (version `20261005135509`, name `0055_work_registry`). The schema objects are all present and verified against the live database. No live system reads or writes these tables yet.
- **The implementation** is `InMemoryWorkRegistry`, the reference, holding all the rules. The **database-backed registry** (`src/lib/work/db-store.ts`, `db-registry.ts`) is implemented over the applied tables: it maps rows to/from the contract losslessly and delegates every rule to the in-memory registry (load → operate → persist, events appended). The rules live in the contract, once, not in each store.

Why the control plane: the registry's job is to be the one place across all brands and channels, and the estate puts central orchestration there. Why not a package yet: no second repository needs to import it today. The trigger to extract is the first brand plane or agent runtime that must create or read work directly.

Work about a brand is **coordination metadata** held centrally (what was asked, who owns it, what was decided), not the brand's operational records. Customer data stays in the brand's own database. Work items reference evidence; they do not copy customer records. Actor identifiers are references and the code refuses an email address or phone number as one.

## The canonical work object

One object (`WorkItem`) for everything. The fields, mapped to the requirement:

| Requirement | Field |
|---|---|
| Work ID | `id` (uuid) and `ref` (short, `W-0001`) |
| Brand | `scope.brand` (central registry key `brands.key`) |
| Company / product / system | `scope.kind`, `scope.system`, `scope.extension` |
| Source / channel | `source.channel`, plus the source events that resolve to it (`source_event_ids`) |
| Requester | `source.requester` |
| Type | `type`: request, incident, support, alert, improvement, opportunity, task |
| Priority | `priority` P0 to P4, with `priority_factors` and `priority_reason` |
| Status | `state` (lifecycle below), `held_from` |
| Owner | `owner`: exactly one accountable owner |
| Supporting agents, observers | `supporting[]`, `observers[]` |
| Created, updated | `created_at`, `updated_at` |
| Deadline / promise | `deadline` {at, kind: promise or target, promised_to} |
| Description | `title`, `description` |
| Customer impact | `customer_impact` |
| Revenue / profit risk | `revenue_profit_risk` {level, note, quantified} |
| Security risk | `security_risk` |
| Evidence | `evidence[]` {kind, ref, summary, by, at} |
| Actions | audit events of kind `action`, in order |
| Resolution | `resolution` {kind, summary, by, at} |
| Closure evidence | `closure` {verified_by, method, evidence_ids} |
| Learning / reference | `learning` {lesson, reference, rule_added} |

Also: `waiting`, `blocked`, `approval`, `escalations[]`, `repo_scope`, `incident`, `merged_into`, `reopen_count`, and `events[]` (the audit trail). Nothing else was added "for someday".

Numbers carry their provenance (`Quantified`): a measured or estimated figure must name its source, and "unknown" is an allowed, honest value with no number. Real numbers only.

## Hierarchy

`OBJECTIVE → INITIATIVE → WORK ITEM → SUBTASK → ACTION`

One table, one `level` field, one `parent_id`. An initiative sits under an objective, a work item under an initiative (or standalone), a subtask under a work item. An ACTION is not a level: it is a logged step on any item (an event). A parent cannot be resolved or closed while subordinate items are open. A child of a brand item must be for the same brand. The four existing objectives in `retail_os_objectives` (setup, live, new, machine) are the natural first objective-level items.

## Scope: company, platform, brand, client-specific, founder

One field on the one object, not five ticket systems.

| `scope.kind` | Meaning | Names |
|---|---|---|
| `devshop` | DevShop company work | optional `system` |
| `retail_os` | Retail OS platform work | optional `system`, optional origin `brand` |
| `brand` | Brand work | `brand` (required) |
| `client_extension` | Client-specific work | `brand` and `extension` (required) |
| `founder` | Founder work | `founder` (required) |

Unknown brand keys are refused when the central registry's keys are supplied.

## Lifecycle

`NEW → TRIAGED → ASSIGNED → IN PROGRESS → (WAITING | BLOCKED | PENDING APPROVAL) → RESOLVED → VERIFICATION → CLOSED → REOPENED`

| From | May go to |
|---|---|
| new | triaged |
| triaged | assigned, waiting, blocked, pending approval |
| assigned | in progress, waiting, blocked, pending approval |
| in progress | waiting, blocked, pending approval, resolved |
| waiting / blocked | back to where it was held from, or in progress when there is an owner |
| pending approval | the same, or resolved once a decision is recorded |
| resolved | verification, reopened |
| verification | closed, reopened |
| closed | reopened |
| reopened | triaged, assigned, in progress |

**RESOLVED is not CLOSED.** An illegal move never throws and never changes anything: it returns a typed error and the item is untouched (tested for all 121 ordered pairs of states). Guards, in plain words:

- **Triage** needs a priority, a valid type and a valid scope. Choosing a priority less urgent than the factors suggest needs a written reason, which is recorded.
- **Assigned** needs exactly one valid owner. **In progress** needs an owner, and an active repository lock if the item is material software work.
- **Waiting** names who or what. **Blocked** needs an open blocking item or a stated reason, and cannot resume while a blocker is open.
- **Pending approval** needs a recorded approval request; leaving it needs a recorded decision.
- **Resolved** needs a resolution kind and summary (duplicates are resolved by merging, not here), and all subordinate items closed. An incident also needs a diagnosis, a passing test and a result.
- **Closed** needs verification: how it was checked and at least one piece of evidence, all subordinate items closed, and no repository lock held. For P0 and P1 the verifier is someone other than whoever resolved it. An incident also needs a lesson, and P0/P1 also prevention and an explicit cost and revenue impact.
- **Reopened** needs a reason; it clears the resolution and closure from the item and keeps them in the audit trail. A merged duplicate can never be reopened.

## Priority

`P0 Critical, P1 Urgent, P2 Important, P3 Normal, P4 Backlog / Improvement`, suggested from the agreed factors as levels, not a score: customer harm, revenue/profit risk, promise or deadline risk, security, operational disruption, strategic importance, dependency. The most urgent applicable rule wins: any critical operational factor is P0; any high one, a promise at risk, or blocking P0/P1 work is P1; any low one, a coming promise, core strategy, or blocking P2 work is P2; an improvement or opportunity touching none of them is P4; everything else is P3. The triager sets the priority; the suggestion is stored beside it. No thresholds were invented: every factor is an input.

## Ownership

**One work item, one accountable owner.** Supporting agents assist and observers watch; the owner moves the item to resolution. A brand CEO owns the business outcome; a specialist owns an execution subtask beneath it (each item has exactly one owner). An actor holds one role on an item, so who is accountable is never ambiguous. External people (the accountants, legal advisers, a brand founder) are escalation targets, never owners.

Actor ids are the `org_members` ids (`DS-00`, `TC-01`, `P-01` and the rest). **Prince gets work only through Virat** (ORG-SOP: "Work for Prince: Virat assigns"), so he cannot be made owner or supporting by anyone else, by assignment, reassignment, lateral escalation or merge.

## Source events and deduplication: one issue, one canonical item

Every report is first a **source event** (channel, the channel's own reference, thread, fingerprint, reporter, brand). It then resolves to a work item, deterministically and without AI:

1. the same channel and reference again: the same event, nothing new (idempotent);
2. the same thread already on an open item: attach;
3. the same fingerprint (detectors give one issue one fingerprint) on an open item, on any channel: attach;
4. a similar open report (same brand, compatible type, close in time, enough shared words): **uncertain**. A new item is created and linked as a *possible duplicate*; it is never merged automatically;
5. otherwise a new item.

A match to a **closed** item is flagged as a possible regression and never attached. The similarity threshold (0.6) and window (7 days) are **proposed defaults, not measured**; they are parameters.

A person or the owner then **merges** (the duplicate closes as "duplicate", its reports, evidence, people and dependencies move to the canonical item, the more urgent priority and the tighter deadline win) or **rules them not duplicates** (the suggestion goes away). Merges refuse cycles, a closed canonical item, mixed levels, a duplicate with open subordinate items, and reports from different brands unless the canonical item is DevShop or Retail OS platform work. New messages on a merged duplicate's thread land on the canonical item.

## Repository work

A material software task carries `repo_scope`: repository, branch, worktree, paths, deployment target, PR. Before an agent begins material work it runs the preflight, then takes a lock:

1. existing work on that area; 2. its accountable owner; 3. dependencies; 4. repository locks; 5. an existing PR or branch.

Two active locks conflict when they share a repository and any of: the same branch, worktree or deployment target, or overlapping paths. Disjoint paths on different branches and worktrees are explicit separation. **Live brand repositories can be made exclusive** (one writer at a time, whatever the paths), the "one owner per live repo" rule. Only the owner or a supporting agent takes a lock; only the lock owner or the item owner releases it; only Virat or Prince can break one, with a reason. Locks expire (default 24 hours, a proposed default) and are renewed to be kept; resolving or merging an item releases its lock. Path overlap is checked by the contract, not by an index, so take the lock inside a per-repository advisory lock when this is database-backed.

## Escalation

- **Lateral**: straight to the relevant specialist. Accountability moves to them; the previous owner stays on as supporting. No one in between is involved.
- **Human**: when authority or coverage is missing. It must capture: what happened, evidence, impact, risk, what was tried, the decision required, the recommended action, and the owner (who stays accountable). The item holds (WAITING) until the human answers. Human coverage is only **Virat, Prince, Khiwani & Co. (accounting and tax), legal advisers, and the brand founder**. Prince is reached through Virat: an escalation to Prince must come from Virat; anyone else escalates to Virat and recommends Prince.

`awaitingHuman()` answers "what is waiting on whom" in one call.

## Approvals

The foundation the lifecycle needs, not a generic engine. A request records who asked, from whom, what authority, why, the evidence and the recommendation, and puts the item in PENDING APPROVAL. A decision records who decided, when, the outcome and a note (a rejection needs one), then returns the item to where it was held from. **Agents and systems cannot approve.** Only a person who holds the authority can:

| Authority | Who decides |
|---|---|
| money, pricing, outbound comms to a brand/founder/client, posts on Virat's handles, work for Prince, new brand/market/channel, terms/NDAs/legal/equity/hiring, anything irreversible, strategic | Virat (the bold column of the ORG-SOP decision-rights table) |
| accounting and tax | Khiwani & Co., or Virat |
| legal opinion | the legal advisers, or Virat |
| brand judgement (brand facts) | that brand's founder, or Virat |
| technical deployment | Prince, or Virat |

A request to the wrong person is refused. Every request and decision is an audit event and stays on the record when a later approval replaces the current one.

## Incidents

An incident is a work item of **type `incident`** plus an incident record. There is no separate incident system.

`PROBLEM → DIAGNOSIS → OWNER → ACTIONS → EVIDENCE → TEST → RESULT → COST → REVENUE IMPACT → CUSTOMER IMPACT → DECISION → LEARNING → PREVENTION`

Problem, owner, actions, evidence, customer impact and learning are the generic fields of every item; diagnosis, tests, result, cost, revenue impact, decision and prevention are the record. Prevention steps can point at follow-up work items. "Every fix ends with one lesson" (CLAUDE.md): every incident needs one to close.

## Audit trail

Every significant change is an event: previous state, new state, actor, time, reason. Events are append-only and hash-chained (each carries the hash of the one before), frozen in memory, and verified by `verifyChain`, which detects an edited, removed, inserted or reordered entry. The database adds a second guard: `work_events` refuses UPDATE, DELETE and TRUNCATE, and refuses an event that does not continue the chain; work items cannot be deleted. After a round trip through the database the chain still verifies.

## Control Tower relationship

The Work Registry is the canonical operational record the Control Tower will use. **The Control Tower itself is not built.**

| Control Tower step | What the registry already provides |
|---|---|
| DETECT | source events from alerts and agent detections, fingerprints |
| CLASSIFY | type, scope, triage |
| PRIORITISE | priority factors and the suggestion rule |
| DIAGNOSE | evidence, actions, the incident record |
| ASSIGN | one owner, lateral escalation, supporting agents |
| RESOLVE | resolution and the guards |
| VERIFY | verification and closure evidence, independent verifier for P0/P1 |
| COMMUNICATE | approvals for anything sent outward; what is waiting on whom |
| LEARN | learning, linked to `LEARNINGS.md` |
| PREVENT | prevention steps linked to follow-up work |

Not built: the loop that does these steps, routing from live channels, notifications, any screen, and the Agent Passport (the actor has a reserved `passport` field).

## Existing work-like systems (left exactly as they are)

None was changed, migrated or extended. These are the proposed mappings for the day adapters are built. They were read from the migrations and code, not verified against live data. **Do not add ticket-like features to them; extend the registry.**

| Existing | Becomes | Note |
|---|---|---|
| `retail_os_objectives` (4 keys) | objective-level items | |
| `retail_os_ops_tasks` (todo, doing, done, blocked, na; owner team/founder/brand; objective; priority 1 to 3; due) | work items or subtasks | Prince's tasks keep the Virat-assigns rule; priority 1 to 3 would map to P1 to P3, to be confirmed |
| `founder_requests` (queued, confirmed, done, declined) | source events on channel `founder_request`, then type `request` items | |
| `change_requests` (free-text status) | source events on channel `command_centre` | |
| `org_updates` (on track, blocked, needs help, done) | not work: status reports. Later derived from work state | |
| `health_runs`, the health check | source events on channel `system_alert` | |
| custom-build delivery lifecycle (`stage_transitions`) | an initiative per paid custom build, kept as a derived view; its blockers become work items | |
| `lead_messages` awaiting approval | approvals with authority `outbound_comms` | |
| `review_actions` (diagnosis review log) | stays: a domain review log, not work | |

## Database

- **Location:** the DevShop control-plane Supabase project, `vszjwgxvqoqyixpfthwl` ("ViratMohan.com"). This is the canonical Work Registry database. The live brand databases (Travaholic `mdornfpcskvjnuawqpqf`, moon-glasses `fewnyteoprmuyzfvopnb`, ceremony-os `jnfapkxpkdizwjzrccjm`, korbi `dajglwnvrhrxryzjkjka`) are separate projects and were not touched. Brand systems may later emit source events to the central registry through controlled adapters; brand databases are not migrated.
- **Migration:** `migrations/0055_work_registry.sql` — `work_items`, `work_events`, `work_source_events`, `work_links`, `repo_locks`, all with row level security on and no policies (service role only, like the rest of the control plane). It enforces what must hold even if a caller forgets: one accountable owner from assigned onward (a merged duplicate is the only ownerless closed item), closure needs a verified closure with evidence, append-only chained events, no deletes, exclusive locks per item, branch, worktree and deployment target. The schema vocabulary is asserted equal to the contract's (`tests/unit/work/sql.test.ts`, run against an embedded Postgres), so the two cannot drift.
- **Apply status: applied and verified.** `0055` is applied to `vszjwgxvqoqyixpfthwl` (applied by hand through the SQL editor, so there is no `supabase_migrations` ledger row — the last tracked migration is `0054`; harmless, the schema objects are all present). Verified live against the hosted database: all five tables with RLS on; `work_items` 43 columns / 25 check constraints / 2 foreign keys / 1 trigger (no-delete) / 7 indexes; `work_events` 11 / 4 / 1 / 3 triggers (no-change, no-truncate, chain) / 1; `work_source_events` 13 / 3 / 1 / 5; `work_links` 8 / 2 / 2 / 4; `repo_locks` 13 / 3 / 1 / 5; public table count 79 (was 74). The schema vocabulary was also diffed programmatically against the contract and matches. A full round-trip was run against the hosted database inside a transaction and rolled back (nothing committed): seven items inserted and read back — an objective with a child (hierarchy), a closed item with verified closure evidence, an incident, a pending-approval item, a canonical item and a merged duplicate, two source events from different channels resolving to one item (dedup), a repo lock, and a two-event chained audit trail. The negative round-trip (also rolled back) confirmed the guardrails refuse a broken chain, an event UPDATE, an event DELETE, a work-item DELETE, and a close without closure evidence. The database was left clean: 0 rows in all five tables.
- **Done:** the database-backed registry implementing the `src/lib/work` operations over these tables (`db-store.ts`, `db-registry.ts`) is built and tested. It is not wired to any live consumer.

## Source-event ingestion (one adapter, read-only)

`src/lib/work/health-ingest.ts`: the one source adapter. It takes a health-check report that `scripts/health/check.mjs` already produced and turns each **failing** check into a Work Registry source event. It is pure and read-only toward everything it monitors — it does not run the check, fetch anything, touch a brand, assign an owner, change work state beyond ingestion, remediate, deploy or send anything.

- `HEALTH CHECK FAILURE → source event → Work Registry`, via the registry's own deduplication.
- **Idempotent:** `external_ref` is `health:<run-at>:<brand>:<check>`, so re-ingesting the same run creates nothing. `fingerprint` is `health:<brand>:<check>`, so the same check still failing on a later run attaches to the one open item. A recovered check produces no event and the open item is left for a person (the adapter never auto-closes). A check failing again after its item was closed is flagged as a possible regression, never silently reopened.
- **No invented owners:** a failure becomes a `NEW` item (type `incident`) awaiting triage. The control-plane site itself is DevShop-scoped, not a guessed brand; an unknown resolved brand is refused.
- **Health runner IMPLEMENTED (`src/lib/work/health-runner.ts`):** bridges `scripts/health/check.mjs` output through the adapter into the DB-backed Work Registry via `withRegistry` (load → ingest → persist). Single-writer, idempotent, fail-safe. Validates brand resolution before touching the DB — unknown brands with failures are rejected, not misattributed. Does not: run the health check, remediate, assign, notify, deploy, or auto-close. 13 tests in `tests/unit/work/health-runner.test.ts`; 12 tests for the underlying adapter in `tests/unit/work/health-ingest.test.ts`.

## What consumes the registry

- **Today:** nothing operational. The pure contract (`src/lib/work`), the database-backed registry over the applied tables, the one ingestion adapter, and the tests. No page, API route, cron, dashboard, WhatsApp, email, Control Tower, or agent reads or writes it (a boundary test enforces this; the hosted tables exist and are empty). The database-backed registry and the ingestion adapter are IMPLEMENTED; neither is wired to any live consumer (NOT YET CONNECTED).
- **Next, when authorised:** a thin runner that feeds real health-check runs into the adapter, then per-operation transactions / row-locking on the DB-backed registry (today it loads and persists the whole state, a working foundation, not yet concurrency-safe under parallel writers). Neither writes back to any monitored system.

## Production safety

- Nothing imports `src/lib/work/`, and nothing names its tables or migration, outside the library and its tests (tested, and the tests were mutation-checked: each rule was broken on purpose and the test failed).
- No page, API route, cron, `vercel.json`, script or live brand code was touched. The control-plane deploy sits in Ceremony Kitchen's request path (`vercel.json` rewrites `/devshop/ceremonykitchen/*`), so this was kept out of every file that deploy builds from except new, unreferenced ones.
- The one dependency added is the embedded Postgres used by the tests, as a **dev** dependency, with the lockfile changed by 8 added lines and none removed.
- The migration is applied to the control-plane database only; no live brand database was touched, and nothing runs the `migrations/` folder automatically. The hosted round-trips were run inside transactions and rolled back, leaving the tables empty (0 rows).

## Not built, and open decisions

- A live runner feeding real health-check runs into the adapter, any other ingestion from live channels, the Control Tower loop, any UI, the Agent Passport.
- Per-operation transactions and row-locking for the database-backed registry (today it loads and persists the whole state — a working foundation, not concurrency-safe under parallel writers).
- Wiring the health runner to a live schedule (cron or routine that runs `check.mjs` and calls `runHealthIngestion` with the result).
- **Proposed defaults awaiting Virat (still proposed, not company policy):** independent verifier for P0/P1; one lesson per incident; lock lifetime 24 hours; duplicate similarity 0.6 within 7 days.
- Whether brand-scoped work lives centrally (as built, because one canonical item across channels and brands is the point) or in each brand's own database with the control plane indexing it.
- Where Virat's coordination view lives (the Command Centre is the natural home).

## Evidence

333 unit tests in 13 files under `tests/unit/work/`, plus strict typechecking of the library and tests: every ordered pair of lifecycle states, guards, ownership and the Prince rule, priority rules, deduplication and merging, repository locks and the five-point preflight, escalation, approvals, incidents, the audit chain and its tamper detection, the boundary rules, the health-check ingestion adapter (12 tests: idempotency, attach-on-recurrence, regression flagging, no invented owner, malformed input, read-only, multi-brand routing), the database-backed store and registry (`tests/unit/work/db-store.test.ts`: mapper losslessness, a full seven-fixture persist→load round trip with audit chains re-verified, idempotent persist, create/read/transition across reloads, full lifecycle), the schema's invariants against an embedded Postgres engine (including a check that the schema vocabulary equals the contract's and that every fixture story inserts and its audit chain still verifies after reading it back), and seven synthetic stories: a brand founder request, a critical incident, a finance clarification, an agent-generated improvement, a duplicate request from two channels, work needing Virat's approval, and work blocked by another item (`tests/unit/work/fixtures.ts`). Full control-plane suite: 710 tests pass; brand tokens in sync; build succeeds. The hosted schema is applied and verified; a positive and a negative round-trip were run against the live database and rolled back, leaving it clean.
