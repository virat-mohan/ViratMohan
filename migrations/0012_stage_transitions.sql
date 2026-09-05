-- Pipeline transition audit trail (hardening brief P1 item). Every
-- meaningful stage change — admin-driven, client-driven, or automatic —
-- gets a row here: who/what changed it, from what, to what, and why.
-- Run once in Supabase's SQL editor.

create table if not exists stage_transitions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor text not null, -- 'admin' | 'client' | 'system'
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_stage_transitions_submission on stage_transitions(submission_id, created_at desc);

alter table stage_transitions enable row level security;
-- No public policies — service-role key only, same as every other table here.
