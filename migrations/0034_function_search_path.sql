-- Pin search_path on functions from 0032/0033 (Supabase advisor 0011).
alter function public.brand_terms_touch() set search_path = public, pg_catalog;
alter function public.ledger_entries_guard() set search_path = public, pg_catalog;
alter function public.brain_is_staff() set search_path = public, pg_catalog;
alter function public.brain_entities_search() set search_path = public, pg_catalog;
alter function public.brain_events_append_only() set search_path = public, pg_catalog;
alter function public.brain_search(text, text, int) set search_path = public, pg_catalog;
