-- The Work Registry: one canonical work object for DevShop, Retail OS, every brand, founders, agents,
-- incidents, support, alerts, improvements and opportunities. See case-study/WORK-REGISTRY.md.
--
-- NOT applied by anything. Like every migration here it is run by hand, and only when the registry
-- is wired in (no live system reads or writes these tables yet). Safe to run twice.
--
-- The rules of the lifecycle live in ONE place, the contract (src/lib/work). This schema enforces only
-- what must hold even if some caller forgets: structure, one accountable owner, closure needs
-- verification, the audit trail is append-only and chained, locks are exclusive, work is never deleted.
-- The vocabulary lists below are asserted equal to the contract's in tests/unit/work/sql.test.ts.

create table if not exists work_items (
  id               uuid primary key default gen_random_uuid(),
  seq              bigint generated always as identity unique,
  ref              text generated always as ('W-' || lpad(seq::text, 4, '0')) stored,
  level            text not null check (level in ('objective','initiative','work_item','subtask')),
  parent_id        uuid references work_items(id),
  type             text not null check (type in ('request','incident','support','alert','improvement','opportunity','task')),
  title            text not null check (length(btrim(title)) > 0),
  description      text not null default '',
  -- scope: DevShop company, Retail OS platform, brand, client-specific, or founder work. One field, not five tables.
  scope_kind       text not null check (scope_kind in ('devshop','retail_os','brand','client_extension','founder')),
  brand            text,                -- central registry key (brands.key)
  founder          text,
  system           text,
  extension        text,
  channel          text not null check (channel in ('command_centre','brand_support_email','whatsapp','founder_request','agent_detection','system_alert','internal')),
  requester        jsonb not null,      -- {kind,id}: an org_members id, external:<who>, or system:<name>
  priority         text check (priority in ('P0','P1','P2','P3','P4')),
  priority_factors jsonb,
  priority_reason  text,
  state            text not null default 'new' check (state in ('new','triaged','assigned','in_progress','waiting','blocked','pending_approval','resolved','verification','closed','reopened')),
  held_from        text check (held_from in ('triaged','assigned','in_progress')),
  -- ONE accountable owner. Supporting actors and observers are lists; the owner is a single pair of columns.
  owner_kind       text check (owner_kind in ('agent','human')),
  owner_id         text,
  supporting       jsonb not null default '[]'::jsonb,
  observers        jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deadline         jsonb,               -- {at, kind: promise|target, promised_to}
  customer_impact  text,
  revenue_profit_risk jsonb,
  security_risk    jsonb,
  evidence         jsonb not null default '[]'::jsonb,
  waiting          jsonb,
  blocked          jsonb,
  approval         jsonb,               -- the current / latest approval; every request and decision is also an event
  escalations      jsonb not null default '[]'::jsonb,
  repo_scope       jsonb,
  incident         jsonb,               -- incidents are work items of type 'incident' plus this record
  resolution       jsonb,
  closure          jsonb,               -- {verified_by, verified_at, method, evidence_ids}
  learning         jsonb,
  closed_at        timestamptz,
  reopen_count     integer not null default 0 check (reopen_count >= 0),
  merged_into      uuid references work_items(id),

  check ((owner_kind is null) = (owner_id is null)),
  -- from ASSIGNED onward there is exactly one accountable owner (a hold entered from TRIAGED has none yet)
  -- `is not distinct from`, because `held_from = 'triaged'` is NULL when held_from is null, and a NULL check passes
  -- A duplicate merged away before it was ever triaged or assigned carries no owner or priority: the canonical item it
  -- merged into is the accountable one. That is the only exception.
  check (owner_id is not null or state in ('new','triaged') or held_from is not distinct from 'triaged' or merged_into is not null),
  check (state = 'new' or priority is not null or merged_into is not null),
  -- RESOLVED is not CLOSED: closing needs a verified closure with evidence
  check (state <> 'closed' or (closure is not null and jsonb_typeof(closure->'evidence_ids') = 'array' and jsonb_array_length(closure->'evidence_ids') > 0)),
  check (state <> 'closed' or closed_at is not null),
  check (state not in ('resolved','verification') or resolution is not null),
  check (state <> 'pending_approval' or approval is not null),
  check (scope_kind not in ('brand','client_extension') or brand is not null),
  check (scope_kind <> 'client_extension' or extension is not null),
  check (scope_kind <> 'founder' or founder is not null),
  check (level <> 'objective' or parent_id is null),
  check (level <> 'subtask' or parent_id is not null),
  check (parent_id is distinct from id),
  check (merged_into is distinct from id),
  check (merged_into is null or state = 'closed')
);
create index if not exists work_items_state on work_items (state) where state <> 'closed';
create index if not exists work_items_owner on work_items (owner_id) where state <> 'closed';
create index if not exists work_items_brand on work_items (brand) where brand is not null;
create index if not exists work_items_parent on work_items (parent_id) where parent_id is not null;
create index if not exists work_items_approval on work_items ((approval->>'requested_from')) where state = 'pending_approval';

-- Work is closed, never deleted.
create or replace function work_items_no_delete() returns trigger language plpgsql as $$
begin raise exception 'work items are never deleted: close or merge them instead'; end $$;
drop trigger if exists work_items_no_delete on work_items;
create trigger work_items_no_delete before delete on work_items for each row execute function work_items_no_delete();

-- The audit trail: append-only, one chain per item. Actions, evidence, state changes, ownership, locks,
-- approvals, escalations and merges are all events. UPDATE, DELETE and TRUNCATE are refused.
create table if not exists work_events (
  work_id    uuid not null references work_items(id),
  seq        integer not null check (seq > 0),
  at         timestamptz not null,
  actor      jsonb not null,
  kind       text not null check (kind in ('created','state_change','field_change','priority_set','owner_assigned','supporting_changed','observers_changed','evidence_added','action','source_attached','link_added','merged_into','merged_from','lock_acquired','lock_released','lock_renewed','lock_broken','approval_requested','approval_decided','escalated_lateral','escalated_human','incident_updated')),
  from_value text,
  to_value   text,
  reason     text,
  data       jsonb not null default '{}'::jsonb,
  prev_hash  text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash       text not null check (hash ~ '^[0-9a-f]{64}$'),
  primary key (work_id, seq)
);

create or replace function work_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'work_events is append-only: history is never changed or removed'; end $$;
drop trigger if exists work_events_no_change on work_events;
create trigger work_events_no_change before update or delete on work_events for each row execute function work_events_immutable();
drop trigger if exists work_events_no_truncate on work_events;
create trigger work_events_no_truncate before truncate on work_events for each statement execute function work_events_immutable();

-- A new event must continue the chain exactly: the next sequence number, linked to the previous hash.
-- (The content hash itself is computed and verified by the contract, src/lib/work/audit.ts.)
create or replace function work_events_chain() returns trigger language plpgsql as $$
declare last_seq integer; last_hash text;
begin
  select seq, hash into last_seq, last_hash from work_events where work_id = new.work_id order by seq desc limit 1;
  if last_seq is null then
    if new.seq <> 1 or new.prev_hash <> repeat('0', 64) then raise exception 'the first event of an item must be seq 1 linked to the genesis hash'; end if;
  else
    if new.seq <> last_seq + 1 or new.prev_hash <> last_hash then raise exception 'event does not continue the chain (expected seq % linked to the previous hash)', last_seq + 1; end if;
  end if;
  return new;
end $$;
drop trigger if exists work_events_chain on work_events;
create trigger work_events_chain before insert on work_events for each row execute function work_events_chain();

-- Every report, from every channel, is a source event; it resolves to exactly one work item.
create table if not exists work_source_events (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null check (channel in ('command_centre','brand_support_email','whatsapp','founder_request','agent_detection','system_alert','internal')),
  external_ref text not null check (length(btrim(external_ref)) > 0),
  thread_ref  text,
  fingerprint text,
  received_at timestamptz not null,
  reporter    jsonb not null,
  brand       text,
  title       text not null,
  summary     text not null default '',
  type_hint   text check (type_hint in ('request','incident','support','alert','improvement','opportunity','task')),
  work_id     uuid references work_items(id),
  match       jsonb,
  unique (channel, external_ref)       -- the same report twice is the same event
);
create index if not exists work_source_events_thread on work_source_events (channel, thread_ref) where thread_ref is not null;
create index if not exists work_source_events_fingerprint on work_source_events (fingerprint) where fingerprint is not null;
create index if not exists work_source_events_work on work_source_events (work_id);

-- Relationships: blocks (dependency), duplicate_of (merged), possible_duplicate (uncertain), not_duplicate, relates.
create table if not exists work_links (
  id      uuid primary key default gen_random_uuid(),
  kind    text not null check (kind in ('blocks','duplicate_of','possible_duplicate','not_duplicate','relates')),
  from_id uuid not null references work_items(id),
  to_id   uuid not null references work_items(id),
  at      timestamptz not null default now(),
  by      jsonb not null,
  note    text,
  score   numeric,
  check (from_id <> to_id),
  unique (kind, from_id, to_id)
);
create index if not exists work_links_from on work_links (from_id, kind);
create index if not exists work_links_to on work_links (to_id, kind);

-- Repository locks for material software work. One active lock per item, per branch, per worktree and
-- per deployment target. Overlapping PATHS cannot be expressed as an index: the contract checks them,
-- so acquire under a transaction-scoped advisory lock per repository. Expired locks are released by the
-- sweeper before any acquire (an expired but unswept lock still holds its place here).
create table if not exists repo_locks (
  id          uuid primary key default gen_random_uuid(),
  work_id     uuid not null references work_items(id),
  repository  text not null check (length(btrim(repository)) > 0),
  branch      text,
  worktree    text,
  paths       text[] not null default '{}',
  deployment_target text,
  lock_owner  jsonb not null,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  released_at timestamptz,
  released_reason text,
  released_by jsonb,
  check (expires_at > acquired_at),
  check ((released_at is null) = (released_reason is null))
);
create unique index if not exists repo_locks_one_per_item     on repo_locks (work_id) where released_at is null;
create unique index if not exists repo_locks_one_per_branch   on repo_locks (repository, branch) where released_at is null and branch is not null;
create unique index if not exists repo_locks_one_per_worktree on repo_locks (repository, worktree) where released_at is null and worktree is not null;
create unique index if not exists repo_locks_one_per_target   on repo_locks (repository, deployment_target) where released_at is null and deployment_target is not null;

alter table work_items enable row level security;
alter table work_events enable row level security;
alter table work_source_events enable row level security;
alter table work_links enable row level security;
alter table repo_locks enable row level security;
