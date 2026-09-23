-- Brand-named programmes captured at intake (loyalty points, referrals,
-- drops, customer stories). Seeds the white-label store's config and admin
-- settings, replacing template names like "Miles" / "Good Vibes".
alter table retail_os_applications add column if not exists programmes jsonb;
