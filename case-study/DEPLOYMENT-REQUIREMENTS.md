# Deployment requirements for Runtime Activation (Directive 3)

Owner: P-01 Prince (tech@viratmohan.com, cc founder@viratmohan.com).
Approval required from: DS-00 Virat before Prince starts.

## 1. Migration 0057: Agent Training & People OS tables

**File:** `migrations/0057_agent_training_people.sql`
**Target:** Supabase project `vszjwgxvqoqyixpfthwl` (viratmohan.com)
**Method:** Run manually in the Supabase SQL Editor with service_role.

Creates 5 tables:
- `agent_passports` — agent certification state
- `agent_assessments` — passed/failed assessment results
- `human_workers` — Prince and future team members
- `org_decisions` — organisational decisions log
- `onboarding_state` — brand onboarding progress
- `brand_dashboard_config` — per-brand dashboard module config

Plus 3 indexes.

**Pre-check:** Confirm tables don't already exist (`SELECT * FROM information_schema.tables WHERE table_name IN ('agent_passports','agent_assessments','human_workers','org_decisions','onboarding_state','brand_dashboard_config')`).

**RLS:** All tables have RLS enabled. No policies are defined in the migration — service_role access only until policies are added.

## 2. Brain RPC (if not already deployed)

The Brain store (`src/lib/brain/store.ts`) queries tables: `brain_facts`, `brain_rules`, `brain_strategic_priorities`, `brain_org_lines`, `brain_learnings`. These were created by an earlier migration. Confirm they exist.

## 3. Environment variables

No new environment variables required. The runtime handler (`src/pages/retail-os/api/admin/ceo-input.ts`) uses `serviceDb(env)` which reads the existing `SUPABASE_SERVICE_ROLE_KEY` from the Vercel environment.

## 4. Endpoint verification after deploy

After migration and deploy, verify:

```
POST /retail-os/api/admin/ceo-input
Authorization: Basic <admin credentials>
Content-Type: application/json
{"text": "What needs my attention?"}
```

Expected: 200 with `body.extended` present (brainSummary, agentCount, etc).

```
POST /retail-os/api/admin/people-action
Authorization: Basic <admin credentials>
Content-Type: application/json
{"worker_id": "P-01", "work_id": "<any work id>", "action": "accept"}
```

Expected: 200 or error with structured `{ok, error}` response.

## 5. DO NOT

- Do not run this migration on any brand's Supabase project (brand-specific only).
- Do not share the service_role key in chat or email.
- Do not deploy to production until Virat approves.
- Do not seed any data — the runtime handles empty tables gracefully.

## 6. Timing

Deploy during quiet hours (2am–6am IST). Not during a launch, sale or campaign.
