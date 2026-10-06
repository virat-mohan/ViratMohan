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
- **Next, when authorised:** apply migration 0056 to the live control plane and run `npm run verify:ceo-live` (see "Transactional persistence" below). Neither writes back to any monitored system.

## Production safety

- Nothing imports `src/lib/work/`, and nothing names its tables or migration, outside the library and its tests (tested, and the tests were mutation-checked: each rule was broken on purpose and the test failed).
- No page, API route, cron, `vercel.json`, script or live brand code was touched. The control-plane deploy sits in Ceremony Kitchen's request path (`vercel.json` rewrites `/devshop/ceremonykitchen/*`), so this was kept out of every file that deploy builds from except new, unreferenced ones.
- The one dependency added is the embedded Postgres used by the tests, as a **dev** dependency, with the lockfile changed by 8 added lines and none removed.
- The migration is applied to the control-plane database only; no live brand database was touched, and nothing runs the `migrations/` folder automatically. The hosted round-trips were run inside transactions and rolled back, leaving the tables empty (0 rows).

## Not built, and open decisions

- A live runner feeding real health-check runs into the adapter, any other ingestion from live channels, the Control Tower loop, any UI, the Agent Passport.
- Nothing in the write path. `work_persist` (below) is implemented, schema-verified and applied to the live control plane (6 Oct 2026); the application path through it is not yet verified live.
- Wiring the health runner to a live schedule (cron or routine that runs `check.mjs` and calls `runHealthIngestion` with the result).
- **Proposed defaults awaiting Virat (still proposed, not company policy):** independent verifier for P0/P1; one lesson per incident; lock lifetime 24 hours; duplicate similarity 0.6 within 7 days.
- Whether brand-scoped work lives centrally (as built, because one canonical item across channels and brands is the point) or in each brand's own database with the control plane indexing it.
- Where Virat's coordination view lives (the Command Centre is the natural home).

## Evidence

333 unit tests in 13 files under `tests/unit/work/`, plus strict typechecking of the library and tests: every ordered pair of lifecycle states, guards, ownership and the Prince rule, priority rules, deduplication and merging, repository locks and the five-point preflight, escalation, approvals, incidents, the audit chain and its tamper detection, the boundary rules, the health-check ingestion adapter (12 tests: idempotency, attach-on-recurrence, regression flagging, no invented owner, malformed input, read-only, multi-brand routing), the database-backed store and registry (`tests/unit/work/db-store.test.ts`: mapper losslessness, a full seven-fixture persist→load round trip with audit chains re-verified, idempotent persist, create/read/transition across reloads, full lifecycle), the schema's invariants against an embedded Postgres engine (including a check that the schema vocabulary equals the contract's and that every fixture story inserts and its audit chain still verifies after reading it back), and seven synthetic stories: a brand founder request, a critical incident, a finance clarification, an agent-generated improvement, a duplicate request from two channels, work needing Virat's approval, and work blocked by another item (`tests/unit/work/fixtures.ts`). Full control-plane suite: 710 tests pass; brand tokens in sync; build succeeds. The hosted schema is applied and verified; a positive and a negative round-trip were run against the live database and rolled back, leaving it clean.


## Transactional persistence: `work_persist` (migration 0056)

**Status ladder (never collapsed into one word).**
- **CODE COMPLETE:** the function, the store path that calls it, the lifecycle service and endpoint, and the Founder lifecycle controls.
- **SCHEMA VERIFIED:** the real migrations 0055 and 0056 in embedded Postgres: atomicity, rollback, least privilege, concurrency interleavings, lifecycle, health path, the live-verification runner.
- **LIVE SUPABASE VERIFIED, database only and partial:** on 6 Oct 2026, through the Supabase connector (not `supabase-js`, not HTTP), migration 0056 was applied to the control plane (`vszjwgxvqoqyixpfthwl`, "ViratMohan.com"; 0055 and its five tables were already present, row level security on). Verified there: both functions exist; `SECURITY INVOKER`; `search_path = public, pg_temp`; EXECUTE held only by `postgres` and `service_role`, not by `anon`, `authenticated` or PUBLIC; the stored bodies are byte-identical to the repository file (MD5 of `work_persist` 3bfac4583f1b5fc9de50dde8198661b3, of `work_persist_rows` 4cb6a87c810cbbb6e3669ccb85d804ee). Three real `work_persist` calls then committed: payloads built by the real CEO runtime (`runLiveVerification` against a local mirror of live state), sent to the live function as SQL. They created two `[IT-LIVE]` records and appended their audit events. The connector then lost authorisation (every call returned "FGA Authentication Error. Unauthorized"), so a fourth write (evidence on the first record) may or may not have committed, and nothing further was verified or closed.
- **LIVE VERIFIED, application path (6 Oct 2026, commit a7b96cc, as reported by a credentialed session; the raw output was not seen by the session that wrote this):** through `supabase-js` and PostgREST against the control plane, `verify:ceo-live` passed 13 checks (create, reuse, evidence, approval, audit chains, Control Tower read-back, lifecycle close) and `verify:live-concurrency` passed 17 checks: same-Work, different-Work, source-event, repo-lock, link and stale-writer races, a duplicate source event, and a forced mid-write failure that left no partial Work row, events, source event, lock or link. Every record was closed through the lifecycle; none was deleted. The same two scripts are tested against embedded Postgres in the suite.
- **What "concurrent" means here:** two simultaneous requests from two separate clients, each its own `work_persist` transaction on PostgREST's pooled connections. It is not two dedicated database sessions, and it is a handful of races, not a load test.
- **NOT live-verified:** the deployed HTTP endpoints (Ask the CEO, lifecycle), the health report endpoint against the real project, and the Control Tower on the deployed app.
- **PRODUCTION VERIFIED: none.** The application has not been deployed with 0056 present and checked.

**`[IT-LIVE]` records.** The two records left open by the first live attempt (W-0021, W-0023) and the one the first concurrency run left open (W-0051, stuck in NEW because a source event creates Work in NEW and the one-step close only accepted assigned, in progress, resolved or verification) were all closed through the lifecycle, not deleted. `closeTestRecord` (`scripts/verify/ceo-live-run.ts`) now triages and assigns a stuck test record to DS-02 before the one-step close, and it only touches titles starting `[IT-LIVE]` or `[IT-TEST]`. A final close-only run reported nothing left open. Closed records stay in the registry with their full history; the Control Tower shows them only under "include all".

**Rollout order. Do not reverse it.**
1. Apply `migrations/0056_work_persist.sql` to the control plane. **Done 6 Oct 2026.**
2. Verify the function and its permissions (query below). **Done.**
3. Deploy the application commit that uses it (fb28dad or later). Not done. Before step 1 every write through `mutateRegistry` (CEO input, lifecycle, health report) fails closed with "work_persist is not installed in this database"; there is no fallback.
4. Close leftover `[IT-LIVE]` records, then run `npm run verify:ceo-live` and `npm run verify:live-concurrency`. **Done 6 Oct 2026 at a7b96cc (reported by the credentialed session).** `npm run verify:release` runs both when `CEO_LIVE_VERIFY=yes`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
5. Confirm the Founder Control Tower loads and shows the Work.
6. Confirm a health-report write (the next scheduled health check, or a POST with the cron secret).
7. Confirm the CEO endpoint (Ask the CEO).
8. Confirm the lifecycle (resolve, verify, close from the Control Tower).
9. Only then call the transactional CEO foundation production-ready.

Permission check to repeat on the live database:
`select proname, proacl::text, proconfig::text, has_function_privilege('anon', oid, 'execute') as anon, has_function_privilege('authenticated', oid, 'execute') as authenticated, has_function_privilege('service_role', oid, 'execute') as service_role from pg_proc where pronamespace = 'public'::regnamespace and proname in ('work_persist','work_persist_rows');` Expected: anon false, authenticated false, service_role true, ACL `{postgres=X/postgres,service_role=X/postgres}`.

**Live concurrency and rollback procedure (not yet run; needs working database access).** Embedded Postgres is one connection, so the row lock between truly parallel transactions has only been tested as deterministic interleavings. To prove it on the real database, use genuinely separate sessions: send two calls at the same time, each a single multi-statement query `select work_persist(<payload>); select pg_sleep(3);` (one query is one implicit transaction, so the lock is held through the sleep). Payloads come from the real contract (`runLiveVerification` style mirror). (1) Same item, same expected event count: exactly one commits, the other fails `WR409` after waiting. (2) Two different items: both commit. (3) The same `(channel, external_ref)` source event with two new items: one commits, the other fails with the unique violation and leaves no item row. (4) Two new locks on the same branch for different items: one commits, the loser leaves no events. (5) The same link twice: one row. (6) Rollback: one payload with a valid item update and event plus a deliberately invalid link (`from_id = to_id`); afterwards the item row, its event count, the lock and link tables and the audit chain are unchanged. Mark every record `[IT-LIVE]` and close them through the lifecycle.

One logical registry operation is one call to `work_persist(p jsonb)`, and a plpgsql function is one transaction: every change commits or none does.
- **Payload** (built by the store from the registry snapshot and the baseline taken at load): `expect` (item id to the event count it saw), `items_new`, `items_upd`, `events`, `source_events_new`, `source_events_upd`, `locks_new`, `locks_upd`, `links_new`.
- **Order inside the transaction:** lock each updated item row (id order, so two writers cannot deadlock) and compare its highest `seq`, read through the `(work_id, seq)` primary key, with what the writer saw; refuse with SQLSTATE `WR409` if it moved. Then new items, new locks, new source events, events in `(work_id, seq)` order, updated items, new links, changed source events, changed locks. The chain trigger, the unique keys and the check constraints of 0055 remain the final arbiters and abort the whole transaction.
- **Stale writers and duplicates:** `WR409`, unique violations and chain violations all become `WorkConflictError`; `mutateRegistry` re-runs the operation on fresh state up to 3 times, then the endpoint answers 409. Re-running after a lost response is safe because the operation sees the committed state and does nothing twice (the same report is `duplicate_event`; the same request reuses its Work).
- **Security:** SECURITY INVOKER with `search_path = public, pg_temp`; EXECUTE revoked from PUBLIC, anon and authenticated and granted only to service_role; the table-writing helper `work_persist_rows` is granted to nobody, accepts only the five Work Registry tables, writes only writable (non-generated, non-identity) columns, and refuses a payload carrying any other column. Row level security from 0055 still applies. No brand database has these tables.
- **Cost:** a write is 1 database call with no table read. Before it read every event's sequence number (and every source event key when ingesting) and made 3 to 6 write calls. Loading is unchanged: `loadRegistry` still reads all five tables per request, so request cost still grows with the registry; only the write side is now bounded by the items changed.
- **Proved by tests** (`tests/unit/work/persist-fn.test.ts`, `concurrency.test.ts`): a broken event chain, a duplicate report, a stale expectation and a late failure each roll back every related change, including new item rows (the earlier orphan-item race is gone); least privilege and fixed search_path; one call per write; no call when nothing changed; fails closed without the function; stale writer, different items, lock release against lock update, concurrent links, duplicate source events, audit integrity.
- **Remaining limits:** PGlite is a single connection, so the row lock between truly parallel transactions is not exercised locally (the interleavings are deterministic, not parallel) and has not yet been exercised live either; `loadRegistry` is still whole-registry reads; the legacy statement path remains only for a write with no baseline (single-writer seeding) and for tests using hand-written fake clients.

## Lifecycle service

**CODE COMPLETE and SCHEMA-VERIFIED, not live.** `src/lib/work/lifecycle-service.ts` calls the contract's own transitions (nothing re-implemented) and persists each request atomically: `start` (assigned to in progress), `resolve`, `verify`, `close`, and `close_test_record`. RESOLVED is not CLOSED: closing needs a method and at least one piece of evidence, a P0/P1 item cannot be verified by whoever resolved it, an illegal move writes nothing, and the schema independently refuses `closed` without a verified closure, any delete of Work, and any change to an event. Reopening needs a reason and keeps the history. Only the Founder uses the service (`isVirat`); the endpoint is `POST /retail-os/api/admin/work-lifecycle` (admin password, checked again in the handler).

**Closing a test record.** `close_test_record` works only on Work whose title starts with `[IT-LIVE]` or `[IT-TEST]`. In one atomic write: start and resolve by the item's owner (reason: on the Founder's instruction), verification and closure by Virat with a method and evidence; the title keeps its marker, the earlier events are untouched, nothing else is changed, and a failure at any step writes nothing. Real Work is refused. `npm run verify:ceo-live` does this itself at the end unless `CEO_LIVE_KEEP_OPEN=yes`.

**Founder controls.** The Control Tower pipeline tab has a Work card: each open item shows its state in plain words (RESOLVED reads "Waiting for verification. Not closed."; VERIFICATION reads "Evidence is needed to close it."; CLOSED reads "Completed and kept in history.") and only the one valid next action: Start, Mark resolved (needs what was done), Send to verification, Verify and close (needs how it was checked and what was seen). Items waiting for approval, blocked or waiting offer no action. Recently closed Work is listed with who verified it, and every item's last events open under History. The controls call the lifecycle endpoint, so the server enforces every rule again; the browser fields are a convenience, not the control. Steps for a human-owned test record are recorded against the Founder, never against the human owner.

**Health path.** Health Check, Health Report, Work Registry, Control Tower: the runner uses `mutateRegistry`, so it writes through `work_persist` and fails closed (nothing written, error naming the migration) if the function is missing or the client cannot call it. Proved on the real schema in `tests/unit/work/health-transactional.test.ts`; the `/health/report` route itself was not exercised over HTTP because it also writes `health_runs`, which the local database does not have.

## Release-path security review (6 Oct 2026)

A focused read of the release path, not a penetration test. Verified in code unless marked.

**No high-severity finding.** Admin endpoints (`ceo-input`, `work-lifecycle`) check auth inside the handler before any store access and are also gated by `src/middleware.ts`, which uses a timing-safe comparison and fails closed with 503 when `ADMIN_PASSWORD` is unset. An unauthenticated caller cannot create Work or change a lifecycle. `work_persist` and its helper are executable only by `service_role` (`migrations/0056_work_persist.sql`). `brand` in Founder input is checked against the known list; `serviceDb` takes only environment values; brand selection elsewhere is a whitelist lookup behind admin auth. No hardcoded keys or tracked `.env` files were found in `src/`, `scripts/` or `public/`. A more capable model gains no authority: every permit carries `grantsAuthority: false`, and only `provider.ts` can call the API.

**Open findings, none introduced by this release, none fixed here:**
- MEDIUM: `src/pages/retail-os/api/apply.ts` has no rate limit, honeypot or length cap, and sends mail to the submitted address. Header injection is refused (`buildMime` rejects CR/LF), so a crafted address only fails the send. The 2 Oct 2026 lesson says every public form should have all three.
- MEDIUM: `src/pages/retail-os/api/chat.ts` bounds spend per request (3 rounds, 500 tokens, 25 user turns) but not per client; `sessionId` is client-chosen.
- LOW: the `health/report.ts` bearer comparison is a plain `!==` (it runs before any database access and fails closed if `CRON_SECRET` is unset); `safeEqual` exists in `src/lib/admin-auth.ts`. Several admin endpoints return raw `e.message`, behind Basic auth.
- INFO: `work_persist` is `SECURITY INVOKER`, so it relies on `service_role` bypassing row level security; the live runs show it works.
- NOT VERIFIED: the key was not searched for in `.astro` script blocks or `public/` in a dedicated pass; PostgREST filter injection from request bodies was not exercised (no `.or()` or `.ilike()` built from a body was seen).
- NOTE: a local dev server picked up live database credentials from this environment and showed live data during the phone check. Only read-only page loads were made. If that is not intended for development sessions, scope the environment's credentials.
