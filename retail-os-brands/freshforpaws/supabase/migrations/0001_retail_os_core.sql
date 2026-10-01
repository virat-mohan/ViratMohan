-- Fresh For Paws · Retail OS core schema.
-- Table and column names match the other live brands (moon-glasses) so the viratmohan.com
-- console (src/lib/retail-os-portfolio.ts) reads this project unchanged. The store front is
-- WooCommerce; woo_* columns tie every row back to its WooCommerce record.
-- All money is whole rupees (integer), as in the other brands.

create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  woo_customer_id bigint unique,
  name text, email text, phone text,
  city text, state text, pincode text,
  first_order_at timestamptz, last_order_at timestamptz,
  orders_count integer not null default 0,
  newsletter_subscribed boolean not null default false,
  referral_code text,
  created_at timestamptz not null default now()
);
create unique index if not exists customers_email_uq on customers (lower(email)) where email is not null and woo_customer_id is null;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  woo_order_id bigint unique not null,
  woo_order_number text,
  woo_status text not null,                 -- raw WooCommerce status
  status text not null,                     -- Retail OS status: pending | paid | fulfilled | cancelled | refunded
  created_at timestamptz not null,
  modified_at timestamptz,
  customer_id uuid references customers(id),
  customer_name text, customer_phone text, customer_email text,
  delivery_address text, delivery_city text, delivery_state text, delivery_pincode text,
  subtotal integer not null default 0,      -- line items before discounts
  discount_amount integer not null default 0,
  coupon_code_used text,
  coupon_discount_amount integer not null default 0,
  loyalty_discount_amount integer not null default 0,
  referral_discount_amount integer not null default 0,
  shipping_charge integer not null default 0,
  total integer not null default 0,         -- what the customer paid
  refunded_amount integer not null default 0,
  payment_type text,                        -- prepaid | cod
  payment_method text,                      -- WooCommerce gateway id, e.g. razorpay
  payment_status text,
  razorpay_payment_id text,                 -- WooCommerce transaction_id for Razorpay
  is_post_barter boolean not null default false,   -- Pay with a Post order (1% on the Monday invoice)
  delivered_at timestamptz,
  utm_source text, utm_medium text, utm_campaign text,
  attributed_ad_brief_id uuid,
  synced_at timestamptz not null default now()
);
create index if not exists orders_created_at_idx on orders (created_at);
create index if not exists orders_status_idx on orders (status);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  woo_line_id bigint,
  woo_product_id bigint,
  sku text,
  product_name text,
  unit_price integer not null default 0,
  quantity integer not null default 1,
  line_total integer not null default 0,
  unique (order_id, woo_line_id)
);
create index if not exists order_items_order_idx on order_items (order_id);

-- Products, with the Inventory Master fields (canonical name) and the agreed cost per pack.
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  woo_product_id bigint unique not null,
  name text not null,
  sku text,
  category text,                            -- Dog meals, Cat meals (Fresh For Purrs), Puppy meals (Mini Paws), Treats & toppers, Combos
  price integer,                            -- current sale price
  pack_size text,
  shelf_life_days integer,
  cost_per_pack integer,                    -- agreed and signed with the founder, backed by bills
  stock_status text,
  stock_quantity integer,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text, paid_by text, description text,
  amount numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  provider text, template_name text, provider_message_id text,
  status text,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz, read_at timestamptz,
  converted boolean not null default false,
  error_detail text
);

create table if not exists business_plans (
  id uuid primary key default gen_random_uuid(),
  quarter_start date not null,
  drivers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tracking_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  session_key text,
  value integer,
  path text, referrer_host text,
  utm_source text, ad_brief_id uuid,
  created_at timestamptz not null default now()
);

-- Weekly settlement: Monday 12 PM statement for reconciliation and closure, then one invoice.
create table if not exists weekly_statements (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,          -- Monday (IST) of the week covered
  week_end date not null,
  orders_count integer not null,
  gross_sales integer not null,             -- sum of total
  refunds integer not null,
  net_sales integer not null,               -- the sale price base for the split
  product_cost integer not null,            -- 25%
  marketing_cap integer not null,           -- up to 25%
  admin_tech integer not null,              -- 10%
  profit_pool integer not null,             -- 40%
  devshop_share integer not null,           -- 25% of the pool
  founder_share integer not null,           -- 75% of the pool
  pay_with_a_post_sales integer not null,
  pay_with_a_post_fee integer not null,     -- 1% of PwaP sales
  invoice_total integer not null,           -- devshop_share + pay_with_a_post_fee
  status text not null default 'draft',     -- draft | sent | reconciled | invoiced | paid
  sent_at timestamptz, reconciled_at timestamptz, invoiced_at timestamptz, paid_at timestamptz,
  invoice_ref text,
  created_at timestamptz not null default now()
);

create table if not exists woo_sync_state (
  id text primary key default 'orders',
  last_modified_after timestamptz,
  last_run_at timestamptz,
  last_result jsonb
);

-- Commercial split (agreed 1 Oct 2026). Kept as settings so a 90-day review is a data change, not code.
insert into app_settings (key, value) values
  ('SPLIT_PRODUCT_PCT', '25'),
  ('SPLIT_MARKETING_CAP_PCT', '25'),
  ('SPLIT_ADMIN_TECH_PCT', '10'),
  ('SPLIT_DEVSHOP_PCT_OF_POOL', '25'),
  ('PAY_WITH_A_POST_PCT', '1'),
  ('STATEMENT_DAY_TIME_IST', 'MON 12:00'),
  ('MSG91_WHATSAPP_COST_PER_MESSAGE_RUPEES', '0.87')
on conflict (key) do nothing;

-- Weekly statement for the IST week starting p_week_start (a Monday). Pure read; the caller stores it.
create or replace function compute_weekly_statement(p_week_start date)
returns weekly_statements language sql stable as $$
  with s as (select coalesce(max(value) filter (where key='SPLIT_PRODUCT_PCT'),'25')::numeric pp,
                    coalesce(max(value) filter (where key='SPLIT_MARKETING_CAP_PCT'),'25')::numeric mp,
                    coalesce(max(value) filter (where key='SPLIT_ADMIN_TECH_PCT'),'10')::numeric ap,
                    coalesce(max(value) filter (where key='SPLIT_DEVSHOP_PCT_OF_POOL'),'25')::numeric dp,
                    coalesce(max(value) filter (where key='PAY_WITH_A_POST_PCT'),'1')::numeric pwp
             from app_settings),
  o as (select * from orders
        where status not in ('cancelled','pending')
          and created_at >= (p_week_start::timestamp at time zone 'Asia/Kolkata')
          and created_at <  ((p_week_start + 7)::timestamp at time zone 'Asia/Kolkata')),
  t as (select count(*)::int n, coalesce(sum(total),0)::int gross, coalesce(sum(refunded_amount),0)::int refunds,
               coalesce(sum(total - refunded_amount) filter (where is_post_barter),0)::int pwap
        from o),
  c as (select t.*, (t.gross - t.refunds) net, s.* from t, s)
  select gen_random_uuid(), p_week_start, p_week_start + 6, n, gross, refunds, net,
         round(net*pp/100)::int, round(net*mp/100)::int, round(net*ap/100)::int,
         (net - round(net*pp/100) - round(net*mp/100) - round(net*ap/100))::int,
         round((net - round(net*pp/100) - round(net*mp/100) - round(net*ap/100))*dp/100)::int,
         ((net - round(net*pp/100) - round(net*mp/100) - round(net*ap/100)) - round((net - round(net*pp/100) - round(net*mp/100) - round(net*ap/100))*dp/100))::int,
         pwap, round(pwap*pwp/100)::int,
         (round((net - round(net*pp/100) - round(net*mp/100) - round(net*ap/100))*dp/100) + round(pwap*pwp/100))::int,
         'draft'::text, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::text, now()
  from c;
$$;

-- Service role only: no public access to any table.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
