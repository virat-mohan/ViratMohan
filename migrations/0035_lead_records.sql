-- One record per lead, and every conversation with them (email, WhatsApp, calls, chat, notes).
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  instagram text,
  category text,
  source text,                          -- e.g. 'virat_referral', 'site_chat', 'partner'
  stage text not null default 'new' check (stage in ('new','contacted','nda_sent','nda_signed','discovery','proposal','won','lost','paused')),
  next_step text,
  next_step_due date,
  application_id uuid references retail_os_applications(id) on delete set null,
  research jsonb not null default '{}'::jsonb,   -- sourced facts only, each with a url
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists leads_email_uniq on leads (lower(contact_email)) where contact_email is not null;
alter table leads enable row level security;

create table if not exists lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  at timestamptz not null default now(),
  direction text not null check (direction in ('outbound','inbound','internal')),
  channel text not null check (channel in ('email','whatsapp','call','meeting','site_chat','note')),
  status text not null default 'logged' check (status in ('draft','awaiting_approval','sent','logged')),
  subject text,
  body text not null,
  external_ref text,                    -- gmail draft/message id, whatsapp message id
  created_by text not null default 'system'
);
create index if not exists lead_messages_lead_at on lead_messages (lead_id, at);
alter table lead_messages enable row level security;
