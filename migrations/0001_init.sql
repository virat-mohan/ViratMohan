-- Fast Tech Dev Shop intake pipeline.
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,               -- uuid, also used as the public demo-link token
  problem TEXT NOT NULL,             -- may describe more than one problem
  company TEXT,
  website TEXT,                      -- client's site, used to infer brand design system for the artefact
  tools TEXT,                        -- free text: "what tools do you currently use"
  email TEXT NOT NULL,               -- where the demo should go
  status TEXT NOT NULL DEFAULT 'received',
    -- received -> classified -> demo_ready -> approved -> sent | failed
  pnl_levers TEXT,                   -- JSON array: [{category, lever, reasoning}, ...] — one per problem solved
  artefact_html TEXT,                -- the generated interactive HTML demo (covers every problem submitted)
  error TEXT,                        -- last error message, if status = 'failed'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  classified_at TEXT,
  approved_at TEXT,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);
