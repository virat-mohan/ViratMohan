-- Partner FAQ inbox. Questions the /retail-os/faq search could not answer
-- (or that a visitor sent to WhatsApp) are logged here. Virat answers on
-- WhatsApp, pastes the reply into /retail-os/admin/faq, rewords it, and
-- publishes it; published rows are merged into the public FAQ at runtime.
create table if not exists retail_os_faq_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  question_key text not null,              -- normalised, for de-duplication
  reason text,                             -- no_match | weak_match | sent_to_whatsapp | manual
  ask_count integer not null default 1,
  status text not null default 'open',     -- open | published | dismissed
  topic text,
  raw_answer text,                         -- what Virat wrote on WhatsApp
  answer text,                             -- the reworded, published answer
  published_question text,                 -- cleaned-up question as shown on the site
  created_at timestamptz not null default now(),
  last_asked_at timestamptz not null default now(),
  published_at timestamptz
);
create unique index if not exists retail_os_faq_questions_key on retail_os_faq_questions (question_key);
create index if not exists retail_os_faq_questions_status on retail_os_faq_questions (status, last_asked_at desc);
alter table retail_os_faq_questions enable row level security;
