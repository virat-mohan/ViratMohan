-- Successful Case Studies (SCS): found by the daily scan of every live brand's orders
-- (src/lib/case-studies.ts), shown on the founder console for Virat to publish or dismiss,
-- and published on /scs. Percentages only: the brand's name and amounts never leave this
-- table. Applied by hand (Supabase SQL).

create table if not exists case_studies (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null,                 -- internal only, never rendered publicly
  brand_name text not null,                -- internal only, never rendered publicly
  metric text not null,                    -- 'sales_per_day'
  lift_pct integer not null,               -- e.g. 59
  before_start date not null,
  before_end date not null,                -- exclusive
  after_start date not null,
  after_end date not null,                 -- exclusive
  before_orders integer not null,
  after_orders integer not null,
  headline text not null,                  -- public copy, % only
  detail text not null,                    -- public copy, % only
  base_note text not null,                 -- 'small base' honesty line
  status text not null default 'draft' check (status in ('draft','published','dismissed')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (brand_key, metric, after_end)
);
alter table case_studies enable row level security;
create index if not exists case_studies_status_idx on case_studies (status, published_at desc);
