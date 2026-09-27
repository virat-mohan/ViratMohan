-- The brand registry: one row per brand DevShop works with or is talking to, with its
-- commercial model, ownership and founder contacts. The founder console's Brands tab and
-- the Live brands tab read from here; /retail-os/admin/brands edits it. Applied by hand.
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                       -- short slug, matches RETAIL_OS_LIVE_BRANDS / ops brand_key where one exists
  name text not null,
  status text not null default 'lead' check (status in ('lead','building','live','paused','ended')),
  model text check (model in ('profit_share','retainer','co_owned','revenue_share','none')),
  devshop_pct numeric,                            -- DevShop's share of the profit pool (profit_share) or of the brand (co_owned)
  retainer_inr integer,                           -- monthly retainer, when model = retainer
  terms_note text,                                -- plain words: who gets what
  website text,
  instagram text,
  category text,
  contacts jsonb not null default '[]'::jsonb,    -- [{name, role, email, phone}]
  lead_id uuid references leads(id) on delete set null,
  application_id uuid references retail_os_applications(id) on delete set null,
  live_since date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table brands enable row level security;
