-- Customer dashboard: questions, change requests and bug reports.
create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  product text,
  category text,
  message text not null,
  contact text,
  status text default 'new',
  created_at timestamptz default now()
);
alter table change_requests enable row level security;
