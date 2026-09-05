-- Post-approval pipeline: complexity/pricing recommendation, deposit/deadline
-- tracking for the 30-day guarantee, and a weekly update log for the
-- client-facing tracker. Run once in Supabase's SQL editor.
--
-- `status` stays a plain text column (no CHECK constraint) — the full value
-- set now spans:
--   received -> demo_ready -> revising -> sent -> interested ->
--   scoping_scheduled -> scoping_complete -> proposal_sent -> deposit_paid ->
--   build_scheduled -> in_build -> delivered -> feedback_requested ->
--   amc_active
--   (or) failed, refunded

alter table submissions add column if not exists complexity_tier text; -- 'standard' | 'complex'
alter table submissions add column if not exists price_recommendation text; -- human-readable note, e.g. 'Standard — fixed pricing' or 'Complex — custom quote at scoping call'
alter table submissions add column if not exists deposit_paid_at timestamptz;
alter table submissions add column if not exists delivery_deadline timestamptz; -- deposit_paid_at + 30 days; the guarantee clock
alter table submissions add column if not exists weekly_updates jsonb not null default '[]'::jsonb;
-- each entry: { date: ISO string, summary: string, blocker: 'none' | 'client' | 'internal', blocker_detail: string | null }
