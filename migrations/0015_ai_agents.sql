-- Curated AI agent library — same anti-hallucination pattern as
-- `frameworks`: the solutioning engine may only cite an agent that's
-- active here, and only the model's own NAME choice is ever trusted; a
-- name that doesn't match gets flagged for admin review rather than
-- shown as if it were a standard part of the catalog. The point is
-- consistency across different app builds — a fixed, thought-through
-- vocabulary of reusable agent roles, not a fresh ad hoc name every time.
-- Run once in Supabase's SQL editor.

create table if not exists ai_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capability_category text not null, -- short slug, e.g. "data_extraction"
  description text not null,          -- what it actually does, one or two sentences
  typical_trigger text not null,      -- what usually kicks it off
  typical_output text not null,       -- what it hands to the next step
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_agents_active on ai_agents(active);

alter table ai_agents enable row level security;
-- No public policies — service-role key only, same as every other table here.

-- Seed set: 10 functional roles, generalized from the actual mechanisms
-- built this session (checkout recovery, lead routing, support
-- deflection, AR/invoice reconciliation) — thought through as a fixed
-- taxonomy, not invented per-build. Curate/expand from
-- /devshop/admin/ai-agents going forward.
insert into ai_agents (name, capability_category, description, typical_trigger, typical_output) values
  ('Data Extraction Agent', 'data_extraction', 'Pulls structured fields out of unstructured input — an email, a document, an invoice, a message — into usable data.', 'A new unstructured item arrives (email, upload, form submission).', 'A structured record with named fields, ready for the next agent.'),
  ('Classification/Triage Agent', 'classification', 'Categorizes an incoming item into a type, priority, or route based on its content.', 'A new item needs to be routed before anything else can happen to it.', 'A category, priority level, or destination queue.'),
  ('Lookup/Enrichment Agent', 'enrichment', 'Fetches related record context from a connected system — CRM, order system, ledger — to give the item real context.', 'An item has an identifier (order ID, customer ID, invoice number) that needs its full record.', 'The enriched record, merged with whatever context the connected system holds.'),
  ('Decision/Scoring Agent', 'decision', 'Evaluates a set of inputs against rules or scoring criteria to produce a recommendation.', 'Enough data exists on the item to make a judgment call.', 'A score, a recommendation, or a yes/no decision with its reasoning.'),
  ('Drafting/Response Agent', 'drafting', 'Generates a first-draft communication — an email, a reply, a follow-up — grounded in the specific record''s real data.', 'A response or outreach needs to go out, referencing this specific item.', 'A draft message, ready to send automatically or for human review depending on automation level.'),
  ('Action/Execution Agent', 'execution', 'Performs the actual step in the target system — updates a record, sends the message, moves a pipeline stage — once approved (or automatically, per the automation level).', 'A decision or draft has been finalized and needs to be carried out.', 'The system state actually changes — a record updated, a message sent, a stage moved.'),
  ('Monitoring/Escalation Agent', 'monitoring', 'Watches for a time-based or condition-based trigger and escalates or re-routes when it fires.', 'A defined window passes without the expected event (e.g. no reply, no payment).', 'An escalation, a re-route to a different queue/person, or a reminder trigger.'),
  ('Reconciliation/Matching Agent', 'reconciliation', 'Matches two records against each other — invoice to purchase order, payment to invoice — and flags discrepancies.', 'Two related records both exist and need to be checked against each other.', 'A match confirmation or a flagged discrepancy with the specific mismatch named.'),
  ('Summarization/Reporting Agent', 'reporting', 'Condenses a period''s activity into a digest or report for a human reviewer.', 'A reporting interval elapses (daily/weekly) or a reviewer requests a summary.', 'A short digest — what happened, what needs attention, what''s pending.'),
  ('Orchestrator/Router Agent', 'orchestration', 'Sequences the other agents and decides the next step based on the current state of the workflow.', 'The workflow needs to move from one step to the next.', 'A decision on which agent runs next, and with what input.')
on conflict do nothing;
