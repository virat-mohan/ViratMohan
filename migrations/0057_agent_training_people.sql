-- Agent Training, Certification & People OS persistence
-- Applied by hand like every other migration. service_role only.

-- ── Agent passports ──────────────────────────────────────────────────────────

create table if not exists agent_passports (
  agent_id   text primary key,
  agent_name text not null,
  role       text not null,
  reports_to text not null,
  mandate    text not null,
  kras       jsonb not null default '[]',
  kpis       jsonb not null default '[]',
  capabilities jsonb not null default '[]',
  brand_permissions jsonb not null default '[]',
  certification text not null default 'TRAINING_REQUIRED'
    check (certification in ('TRAINING_REQUIRED','TRAINING','ASSESSMENT','CERTIFIED_L1','CERTIFIED_L2','AUTONOMOUS_L3')),
  training_modules jsonb not null default '[]',
  gaps       jsonb not null default '[]',
  version    text not null default '1.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agent_passports enable row level security;

-- ── Assessment results ───────────────────────────────────────────────────────

create table if not exists agent_assessments (
  id           uuid primary key default gen_random_uuid(),
  agent_id     text not null references agent_passports(agent_id),
  scenario_id  text not null,
  module_id    text not null,
  passed       boolean not null,
  evidence     text not null default '',
  assessed_by  text not null,
  assessed_at  timestamptz not null default now(),
  unique (agent_id, scenario_id, assessed_at)
);

alter table agent_assessments enable row level security;

-- ── Human workers ────────────────────────────────────────────────────────────

create table if not exists human_workers (
  id              text primary key,
  name            text not null,
  email_work      text not null,
  email_personal  text,
  whatsapp        text not null,
  role            text not null,
  scope           text not null default '',
  reports_to      text not null,
  active          boolean not null default true,
  started_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table human_workers enable row level security;

-- ── Organisational decisions / intelligence ──────────────────────────────────

create table if not exists org_decisions (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('company','retail_os','brand')),
  brand       text,
  category    text not null,
  decision    text not null,
  evidence    text not null default '',
  decided_by  text not null,
  decided_at  timestamptz not null default now(),
  superseded_by uuid references org_decisions(id),
  created_at  timestamptz not null default now()
);

alter table org_decisions enable row level security;

-- ── Onboarding state (single source, used by both customer and internal views) ──

create table if not exists onboarding_state (
  brand_key    text primary key,
  client_name  text,
  stage        text not null default 'DISCOVER',
  overall      text not null default 'NOT_STARTED'
    check (overall in ('NOT_STARTED','IN_PROGRESS','WAITING','BLOCKED','COMPLETE','FAILED')),
  components   jsonb not null default '[]',
  complete     int not null default 0,
  total        int not null default 0,
  next_action  jsonb,
  blockers     jsonb not null default '[]',
  work_id      text,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table onboarding_state enable row level security;

-- ── Dashboard configuration per brand ────────────────────────────────────────

create table if not exists brand_dashboard_config (
  brand_key       text primary key,
  enabled_modules jsonb not null default '[]',
  module_states   jsonb not null default '{}',
  brand_ceo_id    text,
  config          jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table brand_dashboard_config enable row level security;

-- Indexes
create index if not exists idx_agent_assessments_agent on agent_assessments(agent_id);
create index if not exists idx_onboarding_state_stage on onboarding_state(stage);
create index if not exists idx_org_decisions_scope on org_decisions(scope, brand);
