-- Framework library metadata expansion (brief §16) — the remaining fields
-- beyond framework_version/source_verified_at/reviewed_by/problem_archetypes
-- already added in migrations/0011. All admin-editable, never model-
-- generated at solutioning time. Run once in Supabase's SQL editor.

alter table frameworks add column if not exists ideal_use_cases jsonb not null default '[]'::jsonb;
alter table frameworks add column if not exists required_conditions jsonb not null default '[]'::jsonb;
alter table frameworks add column if not exists required_evidence jsonb not null default '[]'::jsonb;
alter table frameworks add column if not exists contraindications jsonb not null default '[]'::jsonb;
alter table frameworks add column if not exists expected_intervention_types jsonb not null default '[]'::jsonb;
alter table frameworks add column if not exists applicable_business_functions jsonb not null default '[]'::jsonb;
alter table frameworks add column if not exists applicable_pnl_levers jsonb not null default '[]'::jsonb;
alter table frameworks add column if not exists expert_notes text;
