-- DevShop Retail OS — brand onboarding applications.
-- Run this once in the Supabase project's SQL editor.

create extension if not exists pgcrypto;

create table if not exists retail_os_applications (
  id uuid primary key default gen_random_uuid(),  -- also the public track-link token
  brand_name text not null,
  founder_name text not null,
  founder_email text not null,
  founder_phone text,
  category text,
  format text,                                     -- D2C Direct | Marketplace | Subscription
  handle text,                                      -- Instagram / website
  has_revenue text,                                 -- 'yes' | 'no'
  revenue_range text,
  following text,
  catalog_mode text,                                -- 'shopify' | 'manual'
  shopify_url text,
  product_count text,
  payment_mode text,                                -- 'own' | 'managed'
  pincode text,
  carrier text,                                     -- 'own' | 'none'
  meta_bm text,                                      -- 'yes' | 'no'
  ad_budget text,
  wa_number text,
  post_ack boolean not null default false,          -- opted into Pay with a Post
  split_range_lo integer,                            -- indicative profit-pool split shown at submit time
  split_range_hi integer,
  ai_enabler_track boolean not null default false,   -- true when has_revenue = 'no'
  -- Fixed onboarding pipeline. `status` per stage is a plain text column
  -- (no DB-level enum), one of: pending | done | skipped. `submitted` is
  -- always seeded done at insert time; the rest start pending and are
  -- advanced only from /retail-os/admin.
  stages jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_retail_os_applications_created on retail_os_applications(created_at desc);

-- RLS: locked down, same pattern as `submissions` — the app only ever talks
-- to this table via the service-role key from server-side code, so zero
-- public policies is correct (denies all anon/public-key access by default).
alter table retail_os_applications enable row level security;
