create table if not exists retail_os_design_directions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references retail_os_applications(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  has_existing_site boolean not null,
  primary_reference jsonb not null,
  additional_references jsonb not null default '[]',
  color_palette jsonb not null,
  typography jsonb not null,
  ux_principles jsonb not null default '[]',
  tone_of_voice text not null default '',
  created_at timestamptz not null default now()
);

alter table retail_os_design_directions enable row level security;

create index if not exists retail_os_design_directions_application_id_idx
  on retail_os_design_directions (application_id, created_at desc);
