-- Use-case templates for industry-vertical DevShop pages (starting with
-- /devshop/restaurants). Clicking a pre-written use case on a vertical page
-- should get cheaper and faster every time it's reused: the FIRST click for
-- a given use case runs the real classify+build pipeline and its result gets
-- cached here; every click after that reuses the cached framework selection,
-- solution mechanism, and artefact HTML instead of paying for another Claude
-- call. hit_count is the admin-visible "how often has this specific use case
-- been picked" counter this table exists for.
-- Run once in Supabase's SQL editor.

create table if not exists usecase_templates (
  id text primary key, -- `${vertical}:${slug}`, e.g. "restaurants:wastage-unexplained"
  vertical text not null, -- e.g. "restaurants" — the /devshop/<vertical> page it belongs to
  business_function text not null,
  label text not null, -- the short button label shown on the page
  problem_text text not null, -- the canned problem statement submitted on click

  hit_count integer not null default 0,
  last_used_at timestamptz,

  -- Populated after the first real run; null means "not cached yet."
  cached_submission_id uuid references submissions(id) on delete set null,
  cached_pnl_levers jsonb,
  cached_solution_notes jsonb,
  cached_artefact_html text,
  cached_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_usecase_templates_vertical on usecase_templates(vertical);
create index if not exists idx_usecase_templates_hit_count on usecase_templates(hit_count desc);

alter table usecase_templates enable row level security;
-- No public policies — service-role key only, same as every other table here.
