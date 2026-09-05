-- Framework library metadata upgrade (hardening brief P1 item, never
-- picked up until now). Adds versioning and review provenance to the
-- curated framework library, and a set of problem-archetype tags so a
-- future matching pass has something more structured than free-text
-- when_to_use to key off. Run once in Supabase's SQL editor.

alter table frameworks add column if not exists framework_version integer not null default 1;
alter table frameworks add column if not exists source_verified_at timestamptz;
alter table frameworks add column if not exists reviewed_by text;
alter table frameworks add column if not exists problem_archetypes jsonb not null default '[]'::jsonb;
-- problem_archetypes: short tags like ["funnel-drop-off", "repeat-cost-leakage"] —
-- curated by whoever adds/reviews the framework, not model-generated.
