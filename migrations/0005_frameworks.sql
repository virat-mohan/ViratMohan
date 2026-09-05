-- Admin-curated framework library. The solutioning engine may cite ONLY
-- frameworks that are active in this table — never anything outside it.
-- Run once in Supabase's SQL editor, then review/edit/add rows via
-- /devshop/admin/frameworks going forward.
create table if not exists frameworks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source text not null,           -- who originated/popularized it, e.g. "Korn Ferry"
  business_function text not null, -- one of BUSINESS_FUNCTIONS in src/lib/pnl-levers.ts
  when_to_use text not null,       -- one or two sentences: what kind of root cause this fits
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_frameworks_active on frameworks(active);
create index if not exists idx_frameworks_function on frameworks(business_function);

alter table frameworks enable row level security;
-- No public policies — same pattern as submissions: only the service-role
-- key (server-side only) can read/write this table.

-- Seed set: real, globally documented, proven-at-scale frameworks only.
-- Curate/expand this list from the admin UI — this is just a starting point.
insert into frameworks (name, source, business_function, when_to_use) values
  ('AARRR (Pirate Metrics)', 'Dave McClure / 500 Startups', 'Growth (sales & marketing)', 'When the problem is funnel-stage-specific — acquisition, activation, retention, referral, or revenue conversion breakage.'),
  ('Net Promoter System', 'Bain & Company', 'Growth (sales & marketing)', 'When the problem is retention, advocacy, or referral-driven — customers leaving or not recommending.'),
  ('Jobs to Be Done', 'Clayton Christensen', 'Growth (sales & marketing)', 'When the real problem is unclear product-market fit or customers "hiring" a product for an unstated job.'),
  ('Theory of Constraints', 'Eliyahu Goldratt', 'Efficiency / Operations', 'When the problem is throughput or a single bottleneck backing up the rest of a process.'),
  ('Lean (Toyota Production System)', 'Toyota', 'Efficiency / Operations', 'When the problem is waste, excess handoffs, or non-value-add steps in a repeatable process.'),
  ('Six Sigma DMAIC', 'Motorola / General Electric', 'Efficiency / Operations', 'When the problem is variance or error-rate driven and needs a measured, data-led root cause.'),
  ('Korn Ferry Leadership Architect', 'Korn Ferry', 'HR / People', 'When the problem is leadership capability, succession, or a competency gap in people-management roles.'),
  ('ADDIE Instructional Design', 'U.S. military / instructional design field', 'HR / People', 'When the problem is a skills-transfer or training-content gap, not a leadership-competency gap.'),
  ('DuPont Analysis', 'DuPont Corporation', 'Finance', 'When the problem is margin, return-on-equity, or return-on-capital and needs decomposing into drivers.'),
  ('Zero-Based Budgeting', 'Peter Pyhrr / Texas Instruments', 'Finance', 'When the problem is cost creep with no clear per-line-item ownership or justification.'),
  ('COSO Risk Management Framework', 'Committee of Sponsoring Organizations', 'Legal / Compliance', 'When the problem is exposure or a control gap — something could go wrong undetected.'),
  ('SRE Error Budget Model', 'Google', 'Tech / Engineering', 'When the problem is reliability vs. velocity tradeoffs — reframes "buggy" as a budget to spend.'),
  ('OKRs (Objectives & Key Results)', 'Andy Grove / Intel, popularized by Google', 'Admin', 'When the problem is misaligned priorities or unclear ownership across teams.')
on conflict do nothing;
