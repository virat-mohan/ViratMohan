-- Affiliate partner applications (viratmohan.com/partners). Partners earn 25% of Virat's earnings from brands they bring.
create table if not exists partner_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  city text,
  network text,        -- who they know / how they'd bring brands
  brands_estimate text,
  nda_accepted boolean default false,
  status text default 'new', -- new | nda_sent | active | paused
  created_at timestamptz default now()
);
alter table partner_applications enable row level security;
