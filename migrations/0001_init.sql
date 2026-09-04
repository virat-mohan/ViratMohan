-- Fast Tech Dev Shop intake pipeline.
-- Run this once in the Supabase project's SQL editor (or via `supabase db push`
-- if you're using the Supabase CLI/migrations workflow already).

create extension if not exists pgcrypto;

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),  -- also used as the public demo-link token
  problem text not null,                          -- may describe more than one problem
  company text,
  website text,                                   -- client's site, used to infer brand design system for the artefact
  tools text,                                      -- free text: "what tools do you currently use"
  email text not null,                             -- where the demo should go
  status text not null default 'received',
    -- received -> demo_ready -> sent | failed
  pnl_levers jsonb,                                -- [{category, lever, reasoning}, ...] — one per problem solved
  artefact_html text,                              -- the generated interactive HTML demo (covers every problem submitted)
  error text,                                      -- last error message, if status = 'failed'
  created_at timestamptz not null default now(),
  classified_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz
);

create index if not exists idx_submissions_status on submissions(status);
create index if not exists idx_submissions_created on submissions(created_at desc);

-- RLS: locked down. The app talks to this table only via the service-role
-- key from server-side code (never exposed to the browser), so no public
-- policies are needed — enabling RLS with zero policies denies all access
-- through the anon/public key by default.
alter table submissions enable row level security;
