-- Reply-to-email feedback loop. Run once in Supabase's SQL editor.
alter table submissions add column if not exists feedback_text text;
alter table submissions add column if not exists feedback_round integer not null default 0;

-- Status now also passes through 'revising' while a reply's feedback is
-- being incorporated. No enum constraint exists on `status` (plain text),
-- so no migration needed for that — just documenting the value here.
