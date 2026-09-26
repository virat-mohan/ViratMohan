-- Knowledge loop: the site chat, the lead email assistant and the FAQ share one
-- inbox of open questions (retail_os_faq_questions) and one set of answers (the
-- Brain). A question either bot cannot answer lands in the inbox; an answer Virat
-- gives by email is attached to the question as raw_answer so he only has to
-- reword and publish; a published answer becomes a public Brain fact that both
-- bots recall. See src/lib/knowledge-loop.ts. Applied by hand.
alter table retail_os_faq_questions add column if not exists source text;          -- chat:<session> | email:<gmail thread> | faq | manual
alter table retail_os_faq_questions add column if not exists lead_id uuid references leads(id) on delete set null;
alter table retail_os_faq_questions add column if not exists answer_source text;   -- where raw_answer came from: whatsapp | email:<gmail message id>
create index if not exists retail_os_faq_questions_lead on retail_os_faq_questions (lead_id) where lead_id is not null;
