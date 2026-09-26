-- The Brain: one knowledge unit every feature asks (site chat, expense tagging,
-- reconciliation, self-audit, dashboard help, replies). It learns from corrections.
--
-- Visibility: 'public' (anyone, e.g. site chat), 'partner' (signed-in founders/partners),
-- 'staff' (authenticated staff only). Customer data is always 'staff'.
-- Server code uses the service role (bypasses RLS); the policies below are the
-- floor for any client that talks to these tables with a user JWT.
-- Staff = JWT app_metadata.role = 'staff'.

create extension if not exists pgcrypto;

-- pgvector is optional. If it is available we add embedding columns and an index;
-- otherwise retrieval uses full-text search only (the tsvector columns below).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    execute 'create extension if not exists vector';
  end if;
end $$;

create or replace function brain_is_staff() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff', false)
$$;

-- ---------------------------------------------------------------- entities
create table if not exists brain_entities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('brand','product','vendor','person','customer','channel','term','policy','value')),
  name text not null,
  aliases text[] not null default '{}',
  attributes jsonb not null default '{}'::jsonb,
  source text not null check (length(source) > 0),        -- where this entity was learned (path, table:id, correction:id)
  visibility text not null default 'public' check (visibility in ('public','partner','staff')),
  search tsvector,  -- maintained by brain_entities_search trigger (array_to_string is not immutable)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, name),
  -- customer records never leave staff audiences
  constraint brain_entities_customer_staff check (kind <> 'customer' or visibility = 'staff')
);
create or replace function brain_entities_search() returns trigger language plpgsql as $$
begin
  new.search := to_tsvector('simple', coalesce(new.name,'') || ' ' || array_to_string(new.aliases, ' ') || ' ' || coalesce(new.attributes::text,''));
  return new;
end $$;
drop trigger if exists brain_entities_search on brain_entities;
create trigger brain_entities_search before insert or update on brain_entities
  for each row execute function brain_entities_search();
create index if not exists brain_entities_search_idx on brain_entities using gin (search);
create index if not exists brain_entities_aliases_idx on brain_entities using gin (aliases);

-- ---------------------------------------------------------------- relations
create table if not exists brain_relations (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references brain_entities(id) on delete cascade,
  rel text not null,                                        -- e.g. sells, supplies, owns, alias_of, governs
  to_id uuid not null references brain_entities(id) on delete cascade,
  attributes jsonb not null default '{}'::jsonb,
  source text not null check (length(source) > 0),
  created_at timestamptz not null default now(),
  unique (from_id, rel, to_id)
);
create index if not exists brain_relations_to_idx on brain_relations (to_id);

-- ---------------------------------------------------------------- facts
-- Every fact has a source. No unsourced numbers.
create table if not exists brain_facts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references brain_entities(id) on delete set null,
  topic text,
  statement text not null,
  source text not null check (length(trim(source)) > 0),    -- repo path, table:row, url, correction:id
  source_quote text,                                        -- verbatim text the fact was taken from, when available
  confidence real not null default 1 check (confidence between 0 and 1),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,                                     -- null = still valid
  confirmed_by text,                                        -- 'virat', staff email, 'seed'
  visibility text not null default 'public' check (visibility in ('public','partner','staff')),
  search tsvector generated always as (to_tsvector('english'::regconfig, coalesce(topic,'') || ' ' || statement)) stored,
  created_at timestamptz not null default now(),
  unique (source, statement)
);
create index if not exists brain_facts_search_idx on brain_facts using gin (search);
create index if not exists brain_facts_entity_idx on brain_facts (entity_id);

do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute 'alter table brain_entities add column if not exists embedding vector(1024)';
    execute 'alter table brain_facts add column if not exists embedding vector(1024)';
    execute 'create index if not exists brain_facts_embedding_idx on brain_facts using hnsw (embedding vector_cosine_ops)';
  end if;
end $$;

-- ---------------------------------------------------------------- rules
-- A learned decision: "for schema X, when the item matches M, the answer is Y".
create table if not exists brain_rules (
  id uuid primary key default gen_random_uuid(),
  schema_name text not null,                                -- e.g. expense_tag, settlement_match, reply_route
  match jsonb not null,                                     -- {field, op: equals|contains|regex, value}
  outcome text not null,
  confidence real not null default 0.95 check (confidence between 0 and 1),
  hits integer not null default 0,
  last_used timestamptz,
  created_from_correction uuid,                             -- brain_events.id of the correction that created it
  created_by text not null,
  active boolean not null default true,
  superseded_by uuid references brain_rules(id),
  created_at timestamptz not null default now()
);
create index if not exists brain_rules_schema_idx on brain_rules (schema_name) where active;

-- ---------------------------------------------------------------- events (append-only)
create table if not exists brain_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  type text not null,                                       -- recall, classify, answer, learn, decide, communicate, seed, escalate
  actor text not null default 'brain',
  payload jsonb not null default '{}'::jsonb,
  evidence uuid[] not null default '{}',
  visibility text not null default 'staff' check (visibility in ('public','partner','staff'))
);
create index if not exists brain_events_type_at_idx on brain_events (type, at desc);

create or replace function brain_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'brain_events is append-only';
end $$;
drop trigger if exists brain_events_no_update on brain_events;
create trigger brain_events_no_update before update or delete on brain_events
  for each row execute function brain_events_append_only();

-- ---------------------------------------------------------------- search RPC
-- Full-text search across entities and valid facts, filtered by audience.
create or replace function brain_search(q text, audience text default 'public', max_rows int default 12)
returns table (id uuid, kind text, title text, body text, source text, score real)
language sql stable as $$
  with allowed as (
    select unnest(case audience
      when 'staff' then array['public','partner','staff']
      when 'partner' then array['public','partner']
      else array['public'] end) as v
  ), tq as (select websearch_to_tsquery('english', q) as e, websearch_to_tsquery('simple', q) as s)
  select * from (
    select f.id, 'fact'::text, coalesce(f.topic, 'fact'), f.statement, f.source,
           ts_rank(f.search, tq.e)::real * f.confidence
    from brain_facts f, tq
    where f.search @@ tq.e and (f.valid_to is null or f.valid_to > now())
      and f.visibility in (select v from allowed)
    union all
    select e.id, e.kind, e.name, e.attributes::text, e.source, ts_rank(e.search, tq.s)::real
    from brain_entities e, tq
    where (e.search @@ tq.s or lower(q) = any (select lower(a) from unnest(e.aliases) a) or lower(e.name) = lower(q))
      and e.visibility in (select v from allowed)
  ) r
  order by 6 desc
  limit max_rows
$$;

-- ---------------------------------------------------------------- RLS
alter table brain_entities enable row level security;
alter table brain_relations enable row level security;
alter table brain_facts enable row level security;
alter table brain_rules enable row level security;
alter table brain_events enable row level security;

-- Staff (authenticated with role=staff) can read everything; nobody else reads directly.
-- Public knowledge reaches visitors only through server code (site chat), never direct table access.
drop policy if exists brain_entities_staff_read on brain_entities;
create policy brain_entities_staff_read on brain_entities for select to authenticated using (brain_is_staff());
drop policy if exists brain_relations_staff_read on brain_relations;
create policy brain_relations_staff_read on brain_relations for select to authenticated using (brain_is_staff());
drop policy if exists brain_facts_staff_read on brain_facts;
create policy brain_facts_staff_read on brain_facts for select to authenticated using (brain_is_staff());
drop policy if exists brain_rules_staff_read on brain_rules;
create policy brain_rules_staff_read on brain_rules for select to authenticated using (brain_is_staff());
drop policy if exists brain_events_staff_read on brain_events;
create policy brain_events_staff_read on brain_events for select to authenticated using (brain_is_staff());
drop policy if exists brain_events_staff_insert on brain_events;
create policy brain_events_staff_insert on brain_events for insert to authenticated with check (brain_is_staff());
-- Writes to entities/facts/rules go through server code (service role) so every change is logged in brain_events.
