-- Brain search recall: a question with two topics ("how long until live, and what does it
-- cost?") used to match nothing, because websearch_to_tsquery ANDs every word. Now rows that
-- match every word rank first, and rows that match some words still come back at half weight.
-- Applied by hand (Supabase SQL).
create or replace function brain_search(q text, audience text default 'public', max_rows int default 12)
returns table (id uuid, kind text, title text, body text, source text, score real)
language sql stable as $$
  with allowed as (
    select unnest(case audience
      when 'staff' then array['public','partner','staff']
      when 'partner' then array['public','partner']
      else array['public'] end) as v
  ), tq as (
    select websearch_to_tsquery('english', q) as e,
           websearch_to_tsquery('simple', q) as s,
           -- the same lexemes joined with OR: any-word match
           nullif(replace(websearch_to_tsquery('english', q)::text, ' & ', ' | '), '')::tsquery as eo
  )
  select * from (
    select f.id, 'fact'::text, coalesce(f.topic, 'fact'), f.statement, f.source,
           (case when f.search @@ tq.e then ts_rank(f.search, tq.e) else ts_rank(f.search, tq.eo) * 0.5 end)::real * f.confidence
    from brain_facts f, tq
    where (f.search @@ tq.e or f.search @@ tq.eo) and (f.valid_to is null or f.valid_to > now())
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
