-- The lead journey, end to end: one record per lead from first contact to live store.
-- Stages are ordered (src/lib/lead-journey.ts) and only ever move forward, except to
-- lost/paused. Every stage change stamps stage_changed_at so the admin shows days in stage
-- and the cron knows when a nudge is due. Applied by hand (Supabase SQL).

alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check check (stage in (
  'new','contacted','nda_sent','nda_signed',
  'access_requested','data_connected','plan_ready','plan_sent',
  'discovery','proposal',
  'applied','signed','deposit_paid','building','live',
  'won','lost','paused'));

alter table leads add column if not exists stage_changed_at timestamptz not null default now();
alter table leads add column if not exists nda_sent_at timestamptz;
alter table leads add column if not exists nda_reminded_at timestamptz;
alter table leads add column if not exists nda_signed_at timestamptz;
alter table leads add column if not exists notes text;

create or replace function leads_stage_changed() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then new.stage_changed_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists leads_stage_changed on leads;
create trigger leads_stage_changed before update on leads for each row execute function leads_stage_changed();

-- The mutual NCNDA a lead signs online at /retail-os/nda/[token]. What they saw is frozen by hash.
create table if not exists lead_nda (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  version text not null,                 -- text version, e.g. 'v1-2026-09'
  entity_name text not null,             -- the brand's legal entity
  entity_address text not null,
  signatory_name text not null,
  signatory_title text,
  signatory_email text,
  text_hash text not null,               -- sha256 of the exact agreement text shown
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  unique (lead_id)
);
alter table lead_nda enable row level security;

-- Drafts for the journey carry their purpose so the sender knows which stage follows.
-- purpose values now: nda_request, nda_reminder, access_request, access_reminder, plan_cover

-- The 7-day clock: it starts the moment the NDA is signed AND data is connected, and the
-- store must be live 7 days later. Set once, by the trigger, when a lead reaches data_connected.
alter table leads add column if not exists clock_started_at timestamptz;
create or replace function leads_stage_changed() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage = 'data_connected' and new.clock_started_at is null then new.clock_started_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
