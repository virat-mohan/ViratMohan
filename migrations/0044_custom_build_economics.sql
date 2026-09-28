-- Stage 5D — Custom Build delivery economics (measurement only). Three small tables anchored on
-- submissions. No pricing, no rates, no overhead allocation. RLS on with no policies: service-role
-- (server) access only, same as every other table here. Applied by hand in the Supabase SQL editor,
-- like the other migrations.

-- Actual human hours per project, by role and work category. Hours only — no cost/rate is stored.
create table if not exists custom_build_worklog (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  work_date date not null,
  role text not null,                       -- fde_client_lead | solution_architect | software_engineer | ai_automation_engineer | sme | qa_uat | founder
  hours numeric(6,2) not null check (hours >= 0),
  category text not null,                   -- BUILD | QA | CLIENT | SCOPING | REVISION | GO_LIVE | SUPPORT | OTHER
  note text,
  entered_by text not null default 'admin', -- operator attribution (single shared admin credential today)
  created_at timestamptz not null default now()
);
create index if not exists custom_build_worklog_submission on custom_build_worklog (submission_id, work_date);
alter table custom_build_worklog enable row level security;

-- Direct project costs. Attribution is strict: only 'direct' rows count toward a project's economics;
-- 'shared'/'overhead' are recorded but never folded into one project (protects future DevShop P&L).
create table if not exists custom_build_costs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  amount_paise bigint not null check (amount_paise >= 0),
  category text not null,                   -- free text, e.g. hosting | llm | saas | domain
  attribution text not null default 'direct' check (attribution in ('direct','shared','overhead')),
  source text not null,                     -- where the number came from, e.g. 'vercel invoice'
  is_actual boolean not null default true,  -- actual vs estimated
  incurred_on date,
  entered_by text not null default 'admin',
  created_at timestamptz not null default now()
);
create index if not exists custom_build_costs_submission on custom_build_costs (submission_id);
alter table custom_build_costs enable row level security;

-- Revenue actuals, one row per Custom Build. Contracted / invoiced / collected are separate and
-- never overwrite each other; a deposit is none of these. Amounts in paise.
create table if not exists custom_build_revenue (
  submission_id uuid primary key references submissions(id) on delete cascade,
  contracted_paise bigint check (contracted_paise >= 0),
  invoiced_paise bigint check (invoiced_paise >= 0),
  collected_paise bigint check (collected_paise >= 0),
  currency text not null default 'INR',
  updated_by text not null default 'admin',
  updated_at timestamptz not null default now()
);
alter table custom_build_revenue enable row level security;
