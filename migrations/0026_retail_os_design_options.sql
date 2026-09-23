-- Three design directions per generation, one of which the brand chooses.
-- Rows from the same generation share a batch_id; older single-direction
-- rows keep batch_id null and read as a one-option set.
alter table retail_os_design_directions add column if not exists batch_id uuid;
alter table retail_os_design_directions add column if not exists option_name text;
alter table retail_os_design_directions add column if not exists option_summary text;
alter table retail_os_design_directions add column if not exists sort_order integer not null default 0;
alter table retail_os_design_directions add column if not exists chosen boolean not null default false;
