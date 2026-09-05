-- Industry intake (item 1) — captured at intake so framework selection can
-- reason about industry fit instead of guessing it from the problem text
-- alone, and so past applications can be looked up by industry (item 2).
alter table submissions add column if not exists industry text;

create index if not exists idx_submissions_industry on submissions(industry);
