-- Daily Founder Update: who receives each brand's daily update, subscribed from
-- the day the brand signs. to_emails is comma-separated. waiting_on is an
-- optional, client-facing gentle reminder of what's on the founder's side.
create table if not exists retail_os_founder_update_subs (
  id uuid primary key default gen_random_uuid(),
  brand_key text not null unique,
  brand_name text not null,
  to_emails text not null,
  active boolean not null default true,
  started_on date,
  waiting_on text,
  created_at timestamptz not null default now()
);

comment on table retail_os_founder_update_subs is 'Who gets the Daily Founder Update per brand. to_emails is comma-separated. A brand is subscribed from the day it signs; the founder-update cron reads active rows.';
comment on column retail_os_founder_update_subs.waiting_on is 'Optional gentle reminder of what is waiting on the founder, shown client-facing in the daily update. Null = nothing needed from them right now.';
