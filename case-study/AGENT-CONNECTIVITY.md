# Agent Connectivity Map

As of 10 Oct 2026. Branch: `claude/laughing-gates-hgqo0o`.

## Current architecture

```
Virat (DS-00)
  │
  ├─ POST /retail-os/api/admin/ceo-input ──→ Dev (DS-02) orchestrator
  │     └─ handleFounderInput(auth, body, deps)
  │        deps: Brain, decisions, training, onboarding, dashboards
  │
  ├─ POST /retail-os/api/org/update ──→ org board (org_members, org_updates)
  │     └─ any agent or human posts status here
  │
  └─ POST /retail-os/api/admin/people-action ──→ People OS
        └─ accept / blocker / complete work items for Prince (P-01)
```

### Dev (DS-02) orchestrator internals

```
Founder input
  │
  ├─ classifier (founder-input.ts) ── deterministic, no AI
  │     outputs: create_work | find_work | status_query | approval | investigation | delegate
  │
  ├─ coordinator (coordinator.ts) ── routes to agent or work item
  │     uses: Work Registry, priority policy, role bindings, control tower
  │
  ├─ certification gate (authority.ts)
  │     checks: target agent is CERTIFIED_L1+ before delegation
  │     source: storedAssessments from agent_assessments table
  │
  └─ channel adapter (channel-adapter.ts)
        Command Centre: CONNECTED
        Gmail: SETUP_REQUIRED
        WhatsApp: SETUP_REQUIRED
```

### Agent hierarchy (types.ts AGENT_REGISTRY)

```
DS-00 Virat (founder) ── money, people, promises
  └─ DS-01 Myoho (guardian) ── mission, values, voice, brand book
       └─ DS-02 Dev (ceo) ── runs DevShop
            ├─ Brand CEOs
            │   ├─ MG-01 Moon (moonglasses)
            │   ├─ TC-01 Trav (caps)
            │   ├─ CK-01 Cera (ceremony)
            │   ├─ FP-01 Paws (freshforpaws) ── not live
            │   └─ KB-01 Kor (korbi) ── not live
            │
            ├─ Function HoDs
            │   ├─ DS-10 Check (quality)
            │   ├─ DS-11 Grow (growth/marketing)
            │   ├─ DS-12 Deal (sales)
            │   ├─ DS-13 Books (finance)
            │   ├─ DS-14 Care (customers)
            │   └─ DS-15 Crew (team/HR)
            │
            └─ Specialists
                ├─ DS-16 Guard (compliance/audit)
                └─ DS-17 Improve (continuous improvement)

P-01 Prince (human, tech ops) ── tasks only through Virat
BD-01..03 Board seats ── open
```

## Data flow: what writes where

| Actor | Writes to | Via | Status |
|-------|-----------|-----|--------|
| Virat | org_updates | POST /api/org/update | LIVE |
| Virat | founder input | POST /api/admin/ceo-input | TESTED, not deployed |
| Prince | org_updates | POST /api/org/update | LIVE |
| Prince | retail_os_ops_tasks | his work page | LIVE |
| Dev (orchestrator) | work_items | Work Registry | TESTED, needs migration 0055 |
| Dev (orchestrator) | org_decisions | db-stores.ts | TESTED, needs migration 0057 |
| Any agent | agent_passports | db-stores.ts | TESTED, needs migration 0057 |
| Any agent | agent_assessments | db-stores.ts | TESTED, needs migration 0057 |
| Brain | brain_* tables | brain/store.ts | LIVE (tables exist) |

## Centralization gaps

### Problem: parallel Claude sessions

Virat and Prince each use separate Claude sessions. Updates stay in session
context or git commits — they don't flow through the org board or Work Registry.
Result: no single timeline, no shared state, no coordination.

### Fix: route through existing infrastructure

1. **Org board** (`/retail-os/admin/org`): every status update posts here via the
   API. One timeline for all agents and humans. Already live.

2. **Work Registry** (needs migration 0055): every task is a work item with one
   owner, one lifecycle, one audit trail. Replaces "I told Prince in chat."

3. **Agent tables** (needs migration 0057): certification state, assessment
   results, human workers, org decisions, onboarding state. Persists between
   sessions.

4. **Brain** (live): decisions, learnings, strategic priorities, org lines.
   Already writes to Supabase.

### Deployment sequence

```
Step 1: Virat approves migrations 0055 + 0057
Step 2: Prince applies them (see DEPLOYMENT-REQUIREMENTS.md)
Step 3: Verify endpoints return data
Step 4: Both sessions start posting through the API
```

## What's not built yet

| Gap | What it means |
|-----|---------------|
| Agent execution runtime | Agents can't run tasks and report back |
| Structured result model | No agent_executions table |
| Durable execution loop | CEO → Work → Agent → Result → CEO not end-to-end |
| Email channel | Gmail connector needs provider setup |
| WhatsApp channel | WhatsApp Business API needs provider setup |
| Agent org dashboard | No dedicated view in the command centre |
| Cross-brand access test | No test that MG-01 can't act on caps work items |
| Performance scoring | CHRO dimensions defined, scoring function not built |
| Incentive flow | CHRO → manager → CFO → CEO → Virat not implemented |

See `case-study/AGENT-STATUS.md` for the full gap list.
