-- End-to-end onboarding journey: brand status + model details at intake,
-- automatic forecast/design preparation, terms -> signature -> deposit ->
-- 7-day build clock, and step-by-step setup answers.
alter table retail_os_applications add column if not exists brand_status text;          -- existing | new_sub_brand | from_zero
alter table retail_os_applications add column if not exists model_details jsonb;        -- marketplace / subscription specifics
alter table retail_os_applications add column if not exists prep_started_at timestamptz;
alter table retail_os_applications add column if not exists prep_error text;
alter table retail_os_applications add column if not exists terms jsonb;                -- {splitPct, aiEnabler, notes, sentAt}
alter table retail_os_applications add column if not exists agreement jsonb;            -- {signedName, signedAt, ip, userAgent, terms}
alter table retail_os_applications add column if not exists deposit jsonb;              -- {amountInr, utr, submittedAt, confirmedAt}
alter table retail_os_applications add column if not exists build_started_at timestamptz;
alter table retail_os_applications add column if not exists setup_answers jsonb not null default '{}';

create index if not exists retail_os_applications_prep_started_idx on retail_os_applications (prep_started_at);
