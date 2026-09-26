-- Post-NDA data audit -> plan.
-- After the NDA, a lead grants read-only access (or uploads CSVs), connectors pull
-- aggregates only, the audit finds the 3 biggest gaps, and a plan is drafted for Virat's approval.

-- 1. Stages: nda_signed -> access_requested -> data_connected -> plan_ready -> plan_sent
alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check check (stage in (
  'new','contacted','nda_sent','nda_signed',
  'access_requested','data_connected','plan_ready','plan_sent',
  'discovery','proposal','won','lost','paused'));
alter table leads add column if not exists access_requested_at timestamptz;
alter table leads add column if not exists access_reminded_at timestamptz;

-- Drafts carry what they are for and when they may go (inside 9am-8pm IST, Mon-Sat).
alter table lead_messages add column if not exists purpose text;       -- access_request, access_reminder, plan_cover
alter table lead_messages add column if not exists send_after timestamptz;

-- 2. One row per lead per source on the access checklist.
create table if not exists lead_access (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  source text not null check (source in ('shopify','meta','ga4','gsc','amazon','flipkart')),
  status text not null default 'not_started' check (status in ('not_started','granted','verified')),
  config jsonb not null default '{}'::jsonb,   -- non-secret ids only: shop domain, ad account id, GA4 property, GSC site
  secret_enc text,                             -- AES-256-GCM ciphertext (a Shopify custom-app token); never sent to the page
  last_error text,
  granted_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (lead_id, source)
);
alter table lead_access enable row level security;

-- 3. Aggregates and derived metrics only. No order rows, no customers, no PII.
create table if not exists lead_data_snapshots (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  source text not null check (source in ('shopify','meta','ga4','gsc','amazon','flipkart')),
  period text not null,                        -- e.g. '2026-06-28..2026-09-25'
  metrics jsonb not null,
  via text not null default 'connector' check (via in ('connector','csv')),
  pulled_at timestamptz not null default now(),
  -- Belt and braces on top of the app-side PII scrub: no email address can land here.
  constraint lead_data_snapshots_no_email check (metrics::text !~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}')
);
create index if not exists lead_data_snapshots_lead on lead_data_snapshots (lead_id, source, pulled_at desc);
alter table lead_data_snapshots enable row level security;

-- 4. The written plan, rendered at /retail-os/plan/[token].
create table if not exists lead_plans (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  audit jsonb not null,
  plan jsonb not null,
  model text,
  status text not null default 'draft' check (status in ('draft','approved','sent')),
  created_at timestamptz not null default now()
);
create index if not exists lead_plans_lead on lead_plans (lead_id, created_at desc);
alter table lead_plans enable row level security;
-- RLS on with no policies: only the service role (server) reads or writes these tables.
