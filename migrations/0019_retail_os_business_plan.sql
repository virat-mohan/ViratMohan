-- DevShop Retail OS — expanded intake fields + business plan / actuals.
-- Run this once in the Supabase project's SQL editor.

-- Expanded intake: commercial and operational terms not captured in 0018.
alter table retail_os_applications add column if not exists payment_methods text;        -- 'cod' | 'prepaid' | 'both'
alter table retail_os_applications add column if not exists shipping_charge_model text;  -- 'free' | 'flat' | 'threshold' | 'calculated'
alter table retail_os_applications add column if not exists free_shipping_threshold text;
alter table retail_os_applications add column if not exists same_day_delivery text;       -- 'yes' | 'no'
alter table retail_os_applications add column if not exists same_day_cities text;
alter table retail_os_applications add column if not exists return_window text;           -- '7' | '14' | '30' | 'none'
alter table retail_os_applications add column if not exists loyalty_methodology text;
alter table retail_os_applications add column if not exists referral_methodology text;
alter table retail_os_applications add column if not exists target_cities text;
alter table retail_os_applications add column if not exists business_registration text;

-- One benchmark quarterly business plan per application, regenerable
-- (a new generation overwrites `assumptions`/`months`, prior runs are not
-- versioned — add a history table later if that's ever needed).
create table if not exists retail_os_business_plans (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references retail_os_applications(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  research_notes text not null,  -- operator-supplied market research (with sources) the plan is grounded in — never blank
  assumptions jsonb not null,    -- [{ label, value, rationale, basis }] — basis: 'supplied_research' | 'brand_data' | 'industry_benchmark_general_knowledge'
  months jsonb not null,         -- [{ label, orders, revenueInr, cogsInr, cacInr, adminTechInr, profitPoolInr, devshopShareInr, founderShareInr, rationale }, x3]
  city_breakdown jsonb not null, -- [{ city, revenueSharePct, rationale }]
  risks jsonb not null,          -- string[]
  sources_cited jsonb not null,  -- string[] — which supplied sources were actually used
  quarter_totals jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_retail_os_business_plans_app on retail_os_business_plans(application_id, created_at desc);

-- Manual monthly actuals — there's no real orders/payments feed into this
-- system yet (see the build-flow doc's gap list), so actuals are admin-
-- entered by hand and compared against the latest business plan's months.
create table if not exists retail_os_actuals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references retail_os_applications(id) on delete cascade,
  month text not null,          -- 'YYYY-MM'
  revenue_inr numeric not null default 0,
  cogs_inr numeric not null default 0,
  cac_inr numeric not null default 0,
  admin_tech_inr numeric not null default 0,
  entered_at timestamptz not null default now(),
  unique (application_id, month)
);

alter table retail_os_business_plans enable row level security;
alter table retail_os_actuals enable row level security;
