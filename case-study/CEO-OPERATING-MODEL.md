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

## Brand data isolation

Each brand retains its own Supabase project and database. No multi-tenancy decision has been made. The Control Tower reads brand data through controlled APIs, never by direct database access.
