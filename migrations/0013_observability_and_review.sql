-- Request-level observability (brief §23-24) + human review action capture
-- (brief §18-19) + one-time implementation human-service model (brief
-- §33-37). Run once in Supabase's SQL editor.

-- Every Claude call gets a traceable row: which submission, what kind
-- (classify/revise/amc/implementation/framework-suggest), model, prompt
-- version, how long it took, how many attempts, and whether it succeeded,
-- failed, or timed out.
create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions(id) on delete cascade,
  kind text not null, -- 'classify' | 'revise' | 'amc_estimate' | 'implementation_estimate' | 'framework_suggest'
  model text not null,
  prompt_version text not null,
  status text not null, -- 'success' | 'error' | 'timeout'
  attempts integer not null default 1,
  duration_ms integer not null,
  error_message text,
  artefact_blocked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_generations_submission on generations(submission_id, created_at desc);

-- Structured human-reviewer actions (§18) — the disagreement data this
-- captures is what feeds the future expert-disagreement loop (§19). One
-- row per review event; not a full before/after diff, but the category +
-- reason is the core signal the brief asks for.
create table if not exists review_actions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  reviewer_name text not null,
  action text not null, -- 'approved' | 'approved_with_edits' | 'diagnosis_changed' | 'framework_changed' | 'pnl_changed' | 'mechanism_changed' | 'blocked'
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_review_actions_submission on review_actions(submission_id, created_at desc);

-- One-time implementation human-service model (§33-37) — parallel to the
-- AMC (ongoing) model already stored in amc_resource_estimate, but for the
-- one-time build itself: role, hours, rationale.
alter table submissions add column if not exists implementation_estimate jsonb;

alter table generations enable row level security;
alter table review_actions enable row level security;
-- No public policies on either — service-role key only, same as every
-- other table here.
