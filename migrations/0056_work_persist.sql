-- work_persist: one logical Work Registry write, atomically. See case-study/WORK-REGISTRY.md.
--
-- NOT applied by anything. Like every migration here it is run by hand, after 0055. Safe to run twice
-- (create or replace). Control-plane Work Registry tables only: work_items, work_events, work_source_events,
-- work_links, repo_locks. No brand database has these tables and none is touched.
--
-- Why: the store used to write a logical change as several statements (items, then events, then source events,
-- links, locks) and discover a stale writer by reading every event's sequence number. A failure between the
-- statements left partial state. This function does the whole write in ONE transaction (a plpgsql function is
-- atomic): either every change commits or none does. The rules still live in the contract (src/lib/work); this
-- only persists what the contract produced.
--
-- Stale writers: for every item being updated the caller says how many events it saw. The function locks the item
-- row (in id order, so two writers cannot deadlock), reads that item's highest seq through the (work_id, seq)
-- primary key, and refuses (SQLSTATE WR409) if it moved. The chain trigger and the unique keys from 0055 stay the
-- final arbiters, and their errors abort the whole transaction too.
--
-- Security: SECURITY INVOKER (the default) with a fixed search_path, so it runs with the caller's rights and the
-- row level security from 0055 still applies. EXECUTE is revoked from PUBLIC, anon and authenticated and granted
-- only to service_role, the role the server uses. The table-writing helper is internal and not granted to anyone.

create or replace function work_persist_rows(tbl text, rows jsonb, upsert_on text default null, order_by text default null)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cols text; sets text; matched integer; supplied integer; n integer; stmt text;
begin
  if tbl is null or tbl not in ('work_items', 'work_events', 'work_source_events', 'work_links', 'repo_locks') then
    raise exception 'work_persist_rows: % is not a Work Registry table', tbl;
  end if;
  if order_by is not null and order_by <> 'work_id, seq' then
    raise exception 'work_persist_rows: unsupported order';
  end if;
  if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then
    return 0;
  end if;

  -- Writable columns only (not generated, not identity) that the caller supplied; every supplied key must be one.
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(quote_ident(a.attname) || ' = excluded.' || quote_ident(a.attname), ', ' order by a.attnum)
           filter (where a.attname <> upsert_on),
         count(*)
    into cols, sets, matched
    from pg_attribute a
   where a.attrelid = to_regclass('public.' || quote_ident(tbl))
     and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity = ''
     and exists (select 1 from jsonb_object_keys(rows -> 0) k where k = a.attname);
  select count(*) into supplied from jsonb_object_keys(rows -> 0);
  if matched = 0 or matched <> supplied then
    raise exception 'work_persist_rows: % rows carry a column that is not writable on %', tbl, tbl;
  end if;

  stmt := format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)', tbl, cols, cols, tbl)
       || case when order_by is not null then ' order by ' || order_by else '' end
       || case when upsert_on is not null then format(' on conflict (%I) do update set %s', upsert_on, sets) else '' end;
  execute stmt using rows;
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function work_persist(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r record; cur integer; counts jsonb := '{}'::jsonb; n integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'work_persist: the payload must be a JSON object';
  end if;

  -- 1. Lock every item being updated (id order) and check nobody moved it since it was loaded.
  for r in select key as id, value as expected from jsonb_each_text(coalesce(p -> 'expect', '{}'::jsonb)) order by key loop
    perform 1 from work_items where id = r.id::uuid for update;
    if not found then
      raise exception using errcode = 'WR409', message = format('work conflict: item %s no longer exists', r.id);
    end if;
    select coalesce(max(seq), 0) into cur from work_events where work_id = r.id::uuid;
    if cur <> r.expected::integer then
      raise exception using errcode = 'WR409',
        message = format('work conflict: item %s changed since it was loaded (expected %s events, found %s)', r.id, r.expected, cur);
    end if;
  end loop;

  -- 2. Rows other rows depend on, then rows a unique key can refuse, then the events that describe them.
  n := work_persist_rows('work_items', p -> 'items_new');                     counts := counts || jsonb_build_object('items_new', n);
  n := work_persist_rows('repo_locks', p -> 'locks_new');                     counts := counts || jsonb_build_object('locks_new', n);
  n := work_persist_rows('work_source_events', p -> 'source_events_new');     counts := counts || jsonb_build_object('source_events_new', n);
  n := work_persist_rows('work_events', p -> 'events', null, 'work_id, seq'); counts := counts || jsonb_build_object('events', n);
  n := work_persist_rows('work_items', p -> 'items_upd', 'id');               counts := counts || jsonb_build_object('items_upd', n);
  n := work_persist_rows('work_links', p -> 'links_new');                     counts := counts || jsonb_build_object('links_new', n);
  n := work_persist_rows('work_source_events', p -> 'source_events_upd', 'id'); counts := counts || jsonb_build_object('source_events_upd', n);
  n := work_persist_rows('repo_locks', p -> 'locks_upd', 'id');               counts := counts || jsonb_build_object('locks_upd', n);

  return jsonb_build_object('ok', true) || counts;
end
$$;

-- Least privilege. The helper is internal: nobody is granted it.
revoke all on function work_persist_rows(text, jsonb, text, text) from public;
revoke all on function work_persist(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function work_persist_rows(text, jsonb, text, text) from anon;
    revoke all on function work_persist(jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function work_persist_rows(text, jsonb, text, text) from authenticated;
    revoke all on function work_persist(jsonb) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function work_persist(jsonb) to service_role;
  end if;
end
$$;
