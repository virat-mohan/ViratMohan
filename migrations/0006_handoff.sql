-- Tech-team handoff document, generated automatically when the deposit
-- clears (markDepositPaid) — the moment a project is "approved for build."
alter table submissions add column if not exists handoff_markdown text;
