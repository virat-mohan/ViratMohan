-- Reels in the publish queue: new kind, a cover image and Instagram collaborators.
-- For a reel, image_url holds the video URL.
alter table social_publish_queue drop constraint if exists social_publish_queue_kind_check;
alter table social_publish_queue add constraint social_publish_queue_kind_check check (kind in ('feed','story','reel'));
alter table social_publish_queue add column if not exists cover_url text;
alter table social_publish_queue add column if not exists collaborators text[] not null default '{}';
