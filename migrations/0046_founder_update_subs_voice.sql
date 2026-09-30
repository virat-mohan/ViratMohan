-- Per-brand voice for the Daily Founder Update: 'we' for partner brands
-- (DevShop co-owns, e.g. Moon Glasses, Travaholic), 'i' for pure clients
-- (default, e.g. Ceremony Kitchen).
alter table retail_os_founder_update_subs add column if not exists voice text not null default 'i';
comment on column retail_os_founder_update_subs.voice is 'Pronoun voice for the daily update: ''we'' for partner brands (DevShop co-owns), ''i'' for pure clients (default).';
