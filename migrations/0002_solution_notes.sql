-- Adds the structured reasoning trail (root cause → lever → mechanism →
-- demo plan) so admin can review *why* the artefact looks the way it does,
-- not just the artefact itself. Run once in Supabase's SQL editor.
alter table submissions add column if not exists solution_notes jsonb;
