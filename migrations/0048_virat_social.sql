-- Virat's personal Instagram (@viratemn, @vmviews): posts, daily metric snapshots,
-- follower mix and the weekly content brief. Read-only sync from the Meta Graph API
-- (system user viratsocialsync); no ads, no boosting. Service role only.

create table if not exists social_posts (
  media_id text primary key,
  ig_id text not null,
  handle text not null,
  media_type text,                    -- VIDEO, IMAGE, CAROUSEL_ALBUM
  product_type text,                  -- REELS, FEED, STORY
  caption text,
  permalink text,
  thumbnail_url text,
  posted_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_posted on social_posts (posted_at desc);
alter table social_posts enable row level security;

-- One row per post per IST day; captured_at lets the 48h trial verdict pick the
-- first snapshot taken at least 48 hours after posting.
create table if not exists social_post_snapshots (
  media_id text not null references social_posts(media_id) on delete cascade,
  day date not null,
  captured_at timestamptz not null default now(),
  reach int, views int, likes int, comments int, shares int, saved int,
  avg_watch_ms int,                   -- ig_reels_avg_watch_time
  total_watch_ms bigint,              -- ig_reels_video_view_total_time
  primary key (media_id, day)
);
alter table social_post_snapshots enable row level security;

create table if not exists social_follower_mix (
  ig_id text not null,
  day date not null,
  breakdown text not null,            -- city, age, gender
  bucket text not null,
  followers int not null,
  primary key (ig_id, day, breakdown, bucket)
);
alter table social_follower_mix enable row level security;

create table if not exists social_briefs (
  week_start date primary key,        -- Monday, IST
  ideas jsonb not null,               -- [{pillar, hook, beats[], caption, why}]
  created_at timestamptz not null default now()
);
alter table social_briefs enable row level security;
