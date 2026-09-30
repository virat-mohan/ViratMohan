-- DevShop invoices. One settings row (issuer, PAN, bank details: entered by Virat in the
-- admin, never kept in the repo) and one row per invoice with its line items frozen as issued.
-- Numbers run per Indian financial year: DS/26-27/0001. Applied by hand (Supabase SQL).
create table if not exists invoice_settings (
  id int primary key default 1 check (id = 1),
  issuer_name text,            -- e.g. Virat Mohan, trading as DevShop Retail OS
  address text,
  email text,
  phone text,
  pan text,
  gstin text,                  -- blank = no GST line on invoices
  gst_rate numeric,            -- e.g. 18, used only when gstin is set
  bank_name text,
  account_name text,
  account_no text,
  ifsc text,
  account_type text,
  upi_id text,
  payment_terms_days int default 7,
  footer_note text,
  updated_at timestamptz not null default now()
);
insert into invoice_settings (id) values (1) on conflict do nothing;
alter table invoice_settings enable row level security;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  fy text not null,                   -- '26-27'
  seq int not null,
  token uuid not null default gen_random_uuid() unique,  -- the shareable /retail-os/invoice/[token] link
  brand_id uuid references brands(id) on delete set null,
  bill_to jsonb not null,             -- {name, company, address, gstin, email}
  issue_date date not null,
  due_date date not null,
  period_start date,
  period_end date,
  lines jsonb not null,               -- [{description, detail, basis, base, pct, amount}]
  subtotal numeric not null,
  tax_rate numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null,
  issuer jsonb not null,              -- snapshot of invoice_settings at issue
  status text not null default 'issued' check (status in ('draft','issued','paid','void')),
  paid_at timestamptz,
  paid_reference text,
  notes text,
  created_at timestamptz not null default now(),
  unique (fy, seq)
);
create index if not exists invoices_brand on invoices (brand_id, issue_date desc);
alter table invoices enable row level security;

-- Next number in a financial year, taken atomically.
create or replace function next_invoice_seq(p_fy text) returns int language sql volatile as $$
  select coalesce(max(seq), 0) + 1 from invoices where fy = p_fy
$$;
