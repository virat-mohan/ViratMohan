-- Retail OS weekly settlement and auto-payout.
-- Every Monday before 1 PM IST each brand gets an honest statement and its money.
-- All money is stored in paise (bigint). RLS is on for every table with no
-- public policies: only the service role (server routes) reads or writes.
-- Do not apply by hand to production without review.

create extension if not exists pgcrypto;

-- ── Per-brand commercial terms ──────────────────────────────────────────────
-- model/rate come from the signed terms: profit share (40% standard), revenue
-- share (15–20%), or retainer. Anything the repo does not define is a config
-- column here rather than a hard-coded number.
create table if not exists brand_terms (
  id uuid primary key default gen_random_uuid(),
  application_id uuid unique references retail_os_applications(id) on delete restrict,
  brand_key text unique not null,                      -- matches retail-os-portfolio brand keys
  brand_name text not null,
  model text not null check (model in ('profit_share', 'revenue_share', 'retainer')),
  rate_pct numeric(5,2) check (rate_pct is null or (rate_pct >= 0 and rate_pct <= 100)),
  retainer_paise bigint check (retainer_paise is null or retainer_paise >= 0),   -- per month
  retainer_deducted_from_settlement boolean not null default false,
  reimburse_product_cost boolean not null default false,  -- not defined in the repo: per-brand decision
  match_tolerance_paise bigint not null default 100 check (match_tolerance_paise >= 0),
  cod_grace_days integer not null default 10 check (cod_grace_days >= 0),      -- COD remittance not yet due
  gateway_grace_days integer not null default 3 check (gateway_grace_days >= 0),  -- gateway settlement not yet due
  whatsapp_group_names text[] not null default '{}',   -- WhatsApp group names that map to this product
  product_keywords text[] not null default '{}',       -- e.g. {caps} for Travaholic, {sunglasses,frames} for Moonglasses
  -- Payout destination. Only the provider's fund-account id is stored, never
  -- bank account numbers or IFSC in plain text.
  payout_provider text not null default 'razorpayx',
  payout_fund_account_id text,                         -- e.g. fa_XXXXXXXX
  payout_account_label text,                           -- e.g. "HDFC ••1234" for display only
  payout_account_changed_at timestamptz,
  statement_email text,
  statement_whatsapp text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Public terms: profit share 40% standard (can come down), revenue share 15–20%, retainer from ₹2.5L a month.
  constraint brand_terms_revenue_share_band check (model <> 'revenue_share' or rate_pct between 15 and 20),
  constraint brand_terms_retainer_floor check (model <> 'retainer' or retainer_paise >= 25000000),
  constraint brand_terms_rate_required check (
    (model = 'retainer' and retainer_paise is not null) or (model <> 'retainer' and rate_pct is not null)
  )
);
alter table brand_terms enable row level security;

-- Any change to the fund account restarts the 72h payout hold.
create or replace function brand_terms_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.payout_fund_account_id is distinct from old.payout_fund_account_id then
    new.payout_account_changed_at := now();
  end if;
  if tg_op = 'INSERT' and new.payout_fund_account_id is not null and new.payout_account_changed_at is null then
    new.payout_account_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists brand_terms_touch on brand_terms;
create trigger brand_terms_touch before insert or update on brand_terms
  for each row execute function brand_terms_touch();

-- ── Append-only double-entry ledger ─────────────────────────────────────────
-- Each row is one balanced posting: amount moves from credit_account to
-- debit_account. Corrections are new rows (kind = 'adjustment'), never edits.
-- (source, source_id) is unique so re-running any import is a no-op.
create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  brand_key text references brand_terms(brand_key) on delete restrict,  -- null only while in the review queue
  kind text not null check (kind in (
    'order_revenue', 'refund', 'rto', 'shipping', 'ad_spend', 'payment_fee',
    'product_cost', 'platform_share', 'adjustment', 'expense',
    'gateway_settlement', 'cod_remittance', 'payout'
  )),
  amount_paise bigint not null check (amount_paise >= 0),
  debit_account text not null,
  credit_account text not null check (credit_account <> debit_account),
  occurred_at timestamptz not null,
  order_id text,                                       -- joins revenue to gateway / COD evidence
  source text not null,                                -- shopify | razorpay | shiprocket | meta | whatsapp | manual | settlement
  source_id text not null,
  description text,
  meta jsonb not null default '{}'::jsonb,            -- e.g. {"payment":"partial_cod","prepaid_paise":..,"cod_paise":..}
  -- The only mutable column. Rows that are not 'posted' never reach a payout.
  review_status text not null default 'posted' check (review_status in ('posted', 'needs_review', 'duplicate', 'rejected')),
  -- How the brand was decided: text_alias | keyword | vendor_memory | sender_default | group_name | claude | allocation | answer | system
  tag_source text,
  tag_confidence numeric(4,3),
  created_at timestamptz not null default now(),
  unique (source, source_id),
  constraint ledger_posted_has_brand check (brand_key is not null or review_status <> 'posted')
);
create index if not exists ledger_entries_brand_time on ledger_entries (brand_key, occurred_at);
create index if not exists ledger_entries_order on ledger_entries (brand_key, order_id);
alter table ledger_entries enable row level security;

create or replace function ledger_entries_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ledger_entries is append-only';
  end if;
  -- review_status may change; brand_key / tag_source may be filled in once (review queue → posted).
  if old.brand_key is not null and new.brand_key is distinct from old.brand_key then
    raise exception 'ledger_entries is append-only: brand_key cannot change once set';
  end if;
  if (new.id, new.kind, new.amount_paise, new.debit_account, new.credit_account,
      new.occurred_at, new.order_id, new.source, new.source_id, new.description, new.meta, new.created_at)
     is distinct from
     (old.id, old.kind, old.amount_paise, old.debit_account, old.credit_account,
      old.occurred_at, old.order_id, old.source, old.source_id, old.description, old.meta, old.created_at) then
    raise exception 'ledger_entries is append-only: only review_status may change';
  end if;
  return new;
end $$;
drop trigger if exists ledger_entries_guard on ledger_entries;
create trigger ledger_entries_guard before update or delete on ledger_entries
  for each row execute function ledger_entries_guard();

-- ── Weekly settlements ──────────────────────────────────────────────────────
create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null references brand_terms(brand_key) on delete restrict,
  week_start date not null,                            -- Monday (IST) the week began
  week_end date not null,                              -- Sunday (IST)
  status text not null default 'draft' check (status in ('draft', 'reconciled', 'approved', 'paid', 'held')),
  hold_reasons text[] not null default '{}',
  terms_snapshot jsonb not null,                       -- model/rate used, frozen for this statement
  lines jsonb not null default '[]'::jsonb,            -- statement lines shown to the brand
  mismatches jsonb not null default '[]'::jsonb,
  gross_revenue_paise bigint not null default 0,
  costs_paise bigint not null default 0,
  profit_pool_paise bigint not null default 0,
  platform_share_paise bigint not null default 0,
  carry_in_paise bigint not null default 0,            -- ≤ 0: last week's negative balance
  payout_paise bigint not null default 0,
  carry_forward_paise bigint not null default 0,       -- ≤ 0: taken into next week
  entries_hash text not null,                          -- sha256 of the included entries
  entry_count integer not null default 0,
  view_token uuid not null default gen_random_uuid() unique,  -- statement link token
  approved_by text,                                    -- 'auto' or 'virat'
  approved_at timestamptz,
  paid_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_key, week_start)
);
alter table settlements enable row level security;

-- Which ledger rows a settlement consumed. An entry can be settled only once.
create table if not exists settlement_entries (
  settlement_id uuid not null references settlements(id) on delete cascade,
  entry_id uuid not null unique references ledger_entries(id) on delete restrict,
  primary key (settlement_id, entry_id)
);
alter table settlement_entries enable row level security;

-- ── Payouts ─────────────────────────────────────────────────────────────────
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null unique references settlements(id) on delete restrict,
  brand_key text not null references brand_terms(brand_key) on delete restrict,
  provider text not null default 'razorpayx',
  provider_payout_id text unique,
  idempotency_key text not null unique,
  fund_account_id text not null,
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'created' check (status in (
    'created', 'queued', 'pending', 'processing', 'processed', 'reversed', 'cancelled', 'rejected', 'failed'
  )),
  utr text,
  failure_reason text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table payouts enable row level security;

-- Raw provider webhook events, deduplicated by event id.
create table if not exists payout_events (
  id text primary key,                                 -- provider event id (x-razorpay-event-id)
  provider text not null,
  event text not null,
  provider_payout_id text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table payout_events enable row level security;

-- ── WhatsApp ledger senders (Cloud API allowlist) ───────────────────────────
-- Only these phone numbers can write to the ledger by WhatsApp. Anyone else
-- is routed to the Retail OS chat-lead flow and never touches the ledger.
create table if not exists ledger_senders (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,                          -- E.164 digits, no '+', e.g. 919876543210
  name text not null,
  default_product text references brand_terms(brand_key) on delete set null,
  role text not null default 'logger' check (role in ('owner', 'admin', 'logger')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table ledger_senders enable row level security;

-- Receipt images sent by allowlisted senders, kept for a later OCR pass.
create table if not exists ledger_attachments (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,                             -- WhatsApp message id
  sender_phone text,
  media_id text not null,
  mime_type text,
  caption text,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);
alter table ledger_attachments enable row level security;

-- ── Brand detection memory ──────────────────────────────────────────────────
-- Aliases and common typos for a brand name ("moon glasses", "travoholic").
create table if not exists brand_aliases (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null references brand_terms(brand_key) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (brand_key, alias)
);
alter table brand_aliases enable row level security;

-- A vendor always tagged to one brand, or a shared cost split by percentage.
-- Rows are written when someone answers "Which brand?" so the question is asked once.
create table if not exists vendor_brand_rules (
  id uuid primary key default gen_random_uuid(),
  match_type text not null default 'vendor' check (match_type in ('vendor', 'category')),
  match_value text not null,                           -- normalised vendor name or ledger kind
  brand_key text references brand_terms(brand_key) on delete cascade,  -- null when shared
  shared boolean not null default false,
  splits jsonb,                                        -- [{"brandKey":"moonglasses","pct":50},...] for shared costs
  created_by text,                                     -- sender phone or 'admin'
  created_at timestamptz not null default now(),
  unique (match_type, match_value),
  constraint vendor_rule_target check ((shared and splits is not null) or (not shared and brand_key is not null) or (shared and splits is null))
);
alter table vendor_brand_rules enable row level security;

-- One open "Which brand?" question per sender, answered by their next message.
create table if not exists ledger_questions (
  id uuid primary key default gen_random_uuid(),
  sender_phone text not null,
  entry_id uuid references ledger_entries(id),
  vendor text,
  options text[] not null,
  status text not null default 'open' check (status in ('open', 'answered', 'expired')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create unique index if not exists ledger_questions_one_open on ledger_questions (sender_phone) where status = 'open';
alter table ledger_questions enable row level security;

-- ── Outbound message queue (quiet hours) ────────────────────────────────────
-- Everything goes out as Virat. Outside 9am–8pm IST Mon–Sat, messages wait here.
create table if not exists outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null,
  subject text,
  body text not null,                                  -- html for email, plain text for WhatsApp
  dedupe_key text unique,                              -- e.g. statement:<settlement id>
  send_after timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outbox_due on outbox (send_after) where status = 'queued';
alter table outbox enable row level security;

-- Inbound WhatsApp message ids already handled (idempotency for webhook retries).
create table if not exists whatsapp_inbound (
  message_id text primary key,
  sender_phone text not null,
  received_at timestamptz not null default now()
);
alter table whatsapp_inbound enable row level security;
