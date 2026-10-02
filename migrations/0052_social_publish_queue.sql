-- Posts prepared for Virat's own Instagram accounts, waiting for his one tap in
-- /retail-os/admin/publish. Nothing publishes without that tap.
create table if not exists social_publish_queue (
  id uuid primary key default gen_random_uuid(),
  handle text not null check (handle in ('viratemn','viratmohan_devshop')),
  kind text not null check (kind in ('feed','story')),
  image_url text not null,
  caption text not null default '',
  note text,                         -- why it qualifies, shown to Virat
  after_id uuid references social_publish_queue(id), -- e.g. a story that follows a feed post
  status text not null default 'ready' check (status in ('ready','published','failed','cancelled')),
  media_id text, permalink text, error text,
  created_at timestamptz not null default now(), published_at timestamptz
);
alter table social_publish_queue enable row level security;
