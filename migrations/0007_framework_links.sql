-- Adds a study link per framework, and a broader seed set so runner-up
-- lists (5-7 alternatives per function) are actually possible. Links are
-- best-effort at time of writing — spot-check before relying on them.
alter table frameworks add column if not exists link text;

update frameworks set link = 'https://en.wikipedia.org/wiki/Pirate_funnel' where name = 'AARRR (Pirate Metrics)';
update frameworks set link = 'https://en.wikipedia.org/wiki/Net_Promoter' where name = 'Net Promoter System';
update frameworks set link = 'https://en.wikipedia.org/wiki/Jobs_to_be_done' where name = 'Jobs to Be Done';
update frameworks set link = 'https://en.wikipedia.org/wiki/Theory_of_constraints' where name = 'Theory of Constraints';
update frameworks set link = 'https://en.wikipedia.org/wiki/Lean_manufacturing' where name = 'Lean (Toyota Production System)';
update frameworks set link = 'https://en.wikipedia.org/wiki/Six_Sigma' where name = 'Six Sigma DMAIC';
update frameworks set link = 'https://en.wikipedia.org/wiki/Instructional_design#ADDIE_Model' where name = 'ADDIE Instructional Design';
update frameworks set link = 'https://en.wikipedia.org/wiki/DuPont_analysis' where name = 'DuPont Analysis';
update frameworks set link = 'https://en.wikipedia.org/wiki/Zero-based_budgeting' where name = 'Zero-Based Budgeting';
update frameworks set link = 'https://www.coso.org/guidance-erm' where name = 'COSO Risk Management Framework';
update frameworks set link = 'https://sre.google/sre-book/embracing-risk/' where name = 'SRE Error Budget Model';
update frameworks set link = 'https://en.wikipedia.org/wiki/OKR' where name = 'OKRs (Objectives & Key Results)';

insert into frameworks (name, source, business_function, when_to_use, link) values
  ('Blue Ocean Strategy', 'W. Chan Kim & Renée Mauborgne, INSEAD', 'Growth (sales & marketing)', 'When the problem is undifferentiated competition in a crowded market rather than execution within it.', 'https://en.wikipedia.org/wiki/Blue_Ocean_Strategy'),
  ('5S Methodology', 'Toyota', 'Efficiency / Operations', 'When the problem is workplace/process disorganization causing repeated small errors or wasted motion.', 'https://en.wikipedia.org/wiki/5S_(methodology)'),
  ('Kaizen Continuous Improvement', 'Masaaki Imai / Toyota', 'Efficiency / Operations', 'When the problem needs an ongoing improvement cadence rather than a one-time fix.', 'https://en.wikipedia.org/wiki/Kaizen'),
  ('GE-McKinsey Nine-Box Matrix', 'General Electric & McKinsey', 'HR / People', 'When the problem is talent/succession prioritization across a team, not one individual''s development.', 'https://en.wikipedia.org/wiki/Growth%E2%80%93share_matrix'),
  ('Activity-Based Costing', 'Robert Kaplan & Robin Cooper, Harvard Business School', 'Finance', 'When the problem is that overhead cost is misallocated across products/services, hiding true unit economics.', 'https://en.wikipedia.org/wiki/Activity-based_costing'),
  ('Three Lines of Defense Model', 'Institute of Internal Auditors', 'Legal / Compliance', 'When the problem is unclear ownership of risk controls across a business, not a single control gap.', 'https://en.wikipedia.org/wiki/Three_lines_of_defence'),
  ('DORA Metrics', 'DevOps Research and Assessment (Google)', 'Tech / Engineering', 'When the problem is engineering throughput/stability tradeoffs and needs a measured baseline first.', 'https://dora.dev/guides/dora-metrics-four-keys/'),
  ('Balanced Scorecard', 'Robert Kaplan & David Norton, Harvard Business School', 'Admin', 'When the problem is that teams optimize for different, uncoordinated goals with no shared scorecard.', 'https://en.wikipedia.org/wiki/Balanced_scorecard'),
  ('RACI Matrix', 'Widely used in project management practice', 'Admin', 'When the problem is unclear decision ownership or accountability across a cross-functional process.', 'https://en.wikipedia.org/wiki/Responsibility_assignment_matrix')
on conflict do nothing;
