-- Scheduled brand reports (daily / weekly / monthly) sent from the founder
-- console by email, and by WhatsApp once MSG91 is connected.
create table if not exists retail_os_report_schedules (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null,                 -- key from RETAIL_OS_LIVE_BRANDS
  frequency text not null,                 -- daily | weekly | monthly
  channel text not null default 'email',   -- email | whatsapp
  recipient text not null,                 -- email address or WhatsApp number
  active boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table retail_os_report_schedules enable row level security;
