-- A brand starting fresh in D2C has no sales history to forecast from. When set, the
-- tracker skips the forecast entirely: no plan is generated and none is shown.
alter table retail_os_applications add column if not exists hide_forecast boolean not null default false;
