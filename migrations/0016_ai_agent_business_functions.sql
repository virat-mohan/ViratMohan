-- AI agent library expansion round 2 — adds a business-function mapping
-- (same taxonomy as `frameworks.applicable_business_functions`, brief
-- consistency) so the library reads as "which agents cover which part of
-- the business," not just a flat list. Also adds two roles that live
-- testing surfaced as genuinely distinct and recurring — not folded into
-- an existing entry because neither is really what that entry does:
-- Exception/Diagnosis Agent (categorizing WHY something failed to match/
-- process, as opposed to Classification/Triage which sorts fresh incoming
-- items) and Notification/Alerting Agent (telling a specific human
-- something needs attention, as opposed to Action/Execution which changes
-- system state, or Monitoring/Escalation which watches for a trigger over
-- time). Admin-curated, never model-generated. Run once in Supabase's SQL
-- editor.

alter table ai_agents add column if not exists applicable_business_functions jsonb not null default '[]'::jsonb;

update ai_agents set applicable_business_functions = '["Efficiency / Operations", "Finance", "Growth (sales & marketing)", "Admin"]'::jsonb where name = 'Data Extraction Agent';
update ai_agents set applicable_business_functions = '["Efficiency / Operations", "Growth (sales & marketing)", "Admin", "Legal / Compliance"]'::jsonb where name = 'Classification/Triage Agent';
update ai_agents set applicable_business_functions = '["Growth (sales & marketing)", "Finance", "Efficiency / Operations"]'::jsonb where name = 'Lookup/Enrichment Agent';
update ai_agents set applicable_business_functions = '["Growth (sales & marketing)", "Finance", "Efficiency / Operations"]'::jsonb where name = 'Decision/Scoring Agent';
update ai_agents set applicable_business_functions = '["Growth (sales & marketing)", "Efficiency / Operations", "Admin"]'::jsonb where name = 'Drafting/Response Agent';
update ai_agents set applicable_business_functions = '["Efficiency / Operations", "Finance", "Tech / Engineering", "Admin"]'::jsonb where name = 'Action/Execution Agent';
update ai_agents set applicable_business_functions = '["Efficiency / Operations", "Tech / Engineering", "Legal / Compliance"]'::jsonb where name = 'Monitoring/Escalation Agent';
update ai_agents set applicable_business_functions = '["Finance", "Efficiency / Operations"]'::jsonb where name = 'Reconciliation/Matching Agent';
update ai_agents set applicable_business_functions = '["Finance", "Efficiency / Operations", "HR / People", "Admin"]'::jsonb where name = 'Summarization/Reporting Agent';
update ai_agents set applicable_business_functions = '["Tech / Engineering", "Efficiency / Operations"]'::jsonb where name = 'Orchestrator/Router Agent';

insert into ai_agents (name, capability_category, description, typical_trigger, typical_output, applicable_business_functions) values
  ('Exception/Diagnosis Agent', 'exception_handling', 'Examines a failed, unmatched, or anomalous case and identifies the likely reason category, so a human can resolve it faster instead of investigating from scratch.', 'A matching, validation, or processing step could not cleanly resolve an item.', 'A tagged reason code and short explanation of why the item didn''t resolve cleanly.', '["Finance", "Efficiency / Operations", "Legal / Compliance"]'::jsonb),
  ('Notification/Alerting Agent', 'notification', 'Sends a targeted message or alert to the specific person or channel who needs to act, distinct from performing the action itself.', 'An event needs a specific human''s attention right now, not just a queued record.', 'A message delivered to the right person or channel, with enough context to act on it immediately.', '["Efficiency / Operations", "Tech / Engineering", "Admin", "HR / People"]'::jsonb)
on conflict do nothing;
