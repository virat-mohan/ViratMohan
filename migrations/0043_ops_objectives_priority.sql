-- Every ops task serves one DevShop objective and has a priority, so a team
-- member's page and the founder console both answer "what matters now".
-- priority: 1 now · 2 next · 3 later.
create table if not exists retail_os_objectives (
  key text primary key,
  title text not null,
  why text not null,
  sort integer not null default 0,
  active boolean not null default true
);
alter table retail_os_objectives enable row level security;

insert into retail_os_objectives (key, title, why, sort) values
  ('setup',   'Get the team set up',          'Every other task needs access first.',                                      1),
  ('live',    'Keep live brands selling',     'Brands that are live get results every Monday.',                             2),
  ('new',     'New brands live in 7 days',    'The mission: a working online business in 7 days.',                         3),
  ('machine', 'Build the DevShop machine',    'Email, payouts and reports that run themselves, so brands are run for them.', 4)
on conflict (key) do nothing;

alter table retail_os_ops_tasks add column if not exists objective text not null default 'new' references retail_os_objectives(key);
alter table retail_os_ops_tasks add column if not exists priority smallint not null default 2 check (priority between 1 and 3);

-- Backfill the tasks that exist today.
update retail_os_ops_tasks set objective = case
  when brand_key = 'onboarding' then 'setup'
  when brand_key = 'platform' and stage_label = 'Access & accounts' then 'setup'
  when brand_key in ('moonglasses', 'caps', 'ceremonykitchen') then 'live'
  when brand_key = 'platform' and stage_label in ('Ceremony OS', 'Moonglasses catalogue', 'Brand reports') then 'live'
  when brand_key = 'platform' then 'machine'
  else 'new' end;
update retail_os_ops_tasks set priority = case
  when due_on is not null and due_on <= date '2026-09-29' then 1
  when due_on is not null and due_on <= date '2026-10-03' then 2
  else 3 end;

create index if not exists retail_os_ops_tasks_priority on retail_os_ops_tasks (member_id, objective, priority, due_on);
