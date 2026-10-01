-- Retail OS · Media assets (core module, every brand): one library of a brand's images,
-- imported from its store (Shopify) or added by hand, keyed by brand_key.
create table if not exists retail_os_media_assets (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null,
  source text not null check (source in ('shopify','upload','drive')),
  source_id text not null,
  url text not null,
  alt text,
  width int,
  height int,
  product_title text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_key, source, source_id)
);
create index if not exists retail_os_media_assets_brand on retail_os_media_assets (brand_key, position);
alter table retail_os_media_assets enable row level security;
