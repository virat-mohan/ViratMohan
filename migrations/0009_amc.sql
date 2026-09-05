-- AMC service-intensity model (hardening brief §29-56). Run once in
-- Supabase's SQL editor.

-- 4b: admin-curated rate benchmarks, same anti-hallucination pattern as the
-- `frameworks` table — the pricing math may only use a rate that's in here,
-- flagged `verified: false` when sourced but not yet cross-checked, never a
-- number invented on the fly.
create table if not exists amc_rate_benchmarks (
  id uuid primary key default gen_random_uuid(),
  resource_category text not null, -- one of RESOURCE_CATEGORIES in src/lib/amc.ts
  domain text not null,            -- e.g. "e-commerce", "B2B SaaS ops", or "general" as fallback
  role_label text not null,        -- e.g. "Senior growth marketer"
  rate_per_hour_inr numeric not null,
  source text not null,            -- citation for this rate
  verified boolean not null default false,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_amc_rates_active on amc_rate_benchmarks(active);
create index if not exists idx_amc_rates_category on amc_rate_benchmarks(resource_category);

alter table amc_rate_benchmarks enable row level security;
-- No public policies — service-role key only, same as every other table here.

-- Seed set: conservative, general-fallback rates only, explicitly marked
-- unverified — curate/expand from /devshop/admin/amc-rates as real
-- benchmarks are sourced.
insert into amc_rate_benchmarks (resource_category, domain, role_label, rate_per_hour_inr, source, verified, note) values
  ('fde_client_engagement', 'general', 'Client success / account manager', 1200, 'Placeholder — not yet benchmarked against a named source', false, 'Seed value, review before relying on it commercially.'),
  ('technical', 'general', 'Automation / integration engineer', 2000, 'Placeholder — not yet benchmarked against a named source', false, 'Seed value, review before relying on it commercially.'),
  ('sme', 'general', 'Domain subject-matter expert', 2500, 'Placeholder — not yet benchmarked against a named source', false, 'Seed value, review before relying on it commercially.'),
  ('ai_optimisation', 'general', 'AI/ML optimisation specialist', 2200, 'Placeholder — not yet benchmarked against a named source', false, 'Seed value, review before relying on it commercially.')
on conflict do nothing;

-- 4e/4f: per-submission AMC profile, resource-hour estimate, pricing
-- recommendation, and the human pricing decision (Approve / Adjust /
-- Custom) — stored so the customer-facing commercial offer and the admin
-- review UI both read from the same recorded state.
alter table submissions add column if not exists amc_solution_profile jsonb;
alter table submissions add column if not exists amc_resource_estimate jsonb;
alter table submissions add column if not exists amc_pricing_recommendation jsonb;
alter table submissions add column if not exists amc_pricing_decision jsonb;
-- amc_pricing_decision shape: { mode: 'approved' | 'adjusted' | 'custom', monthly_amount_inr: number, rationale: string, decided_at: ISO string }
