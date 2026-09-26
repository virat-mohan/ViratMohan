# Learnings log

Every self-audit reads this first and adds to it last. One line per lesson: date, what happened, what to do next time.

- 2026-09-26: Force-resetting the branch orphaned commits. Check `git log origin/main..HEAD` before any reset.
- 2026-09-26: A made-up stat ("Now: 100 brands") slipped into copy. Every number needs a source.
- 2026-09-26: A pronoun was assumed from a name. Use "they" unless stated.
- 2026-09-26: A grid overflowed on mobile. Grid children need `min-width:0`; test at 390px.
- 2026-09-26: Chat escalation emailed Virat an approve link only for phone contacts; email contacts had no way in. Every escalation path needs an approve link for every contact type, and a test for each.
- 2026-09-26: /mission read as a wall of text. Give every big idea a picture (inline SVG or tinted tile), and link the mission from one shared band (.vm-mission in tokens.css) so the wording stays the same everywhere.
- 2026-09-26: A lead-reply recap quoted the lead's own "we" and failed the voice check. Retell their words in second person, and run voiceIssues() on every draft before it reaches Gmail.
- 2026-09-26: A CSV parser dropped every Shopify order because order names start with '#', the same as GA4 comment lines. Strip comment lines only before the header, and test each real export format.
- 2026-09-26: A brand report died with a bare "Invalid API key". Read every stored key before use (decode the project ref, compare with the URL) and show a Connections panel so the admin names the exact fix. Isolate each brand's failure from the others.
