-- Team members who run the manual side of brand onboarding (the Brand Setup
-- KRA), each with a private tracker page at /retail-os/ops/<token>, and the
-- brand-by-brand task list they work through. The founder console reads the
-- same rows to show progress; brand owners never see any of it.
create table if not exists retail_os_team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null,
  token uuid not null unique default gen_random_uuid(),
  started_on date not null,
  monthly_inr integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table retail_os_team_members enable row level security;

create table if not exists retail_os_ops_tasks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references retail_os_team_members(id) on delete cascade,
  brand_key text not null,
  brand_name text not null,
  stage integer not null,                  -- 0 prerequisites … 8 admin, 9 handover/docs
  stage_label text not null,
  task text not null,
  owner text not null default 'team',      -- team | founder | brand
  status text not null default 'todo',     -- todo | doing | done | blocked | na
  note text,
  due_on date,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists retail_os_ops_tasks_member on retail_os_ops_tasks (member_id, brand_key, stage, sort);
alter table retail_os_ops_tasks enable row level security;

create table if not exists retail_os_ops_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references retail_os_team_members(id) on delete cascade,
  task_id uuid references retail_os_ops_tasks(id) on delete set null,
  kind text not null,                      -- status | note | daily | query
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists retail_os_ops_log_member on retail_os_ops_log (member_id, created_at desc);
alter table retail_os_ops_log enable row level security;
