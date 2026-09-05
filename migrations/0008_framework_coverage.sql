-- Legal/Compliance was the thinnest function (2 entries), which pushed the
-- model to pad runner-up lists with unrelated frameworks just to reach a
-- count. One more genuinely distinct entry, not a duplicate of COSO/Three
-- Lines of Defense.
insert into frameworks (name, source, business_function, when_to_use, link) values
  ('ISO 31000 Risk Management', 'International Organization for Standardization', 'Legal / Compliance', 'When the problem needs a structured, repeatable risk-identification-and-treatment process, not just a control-gap fix.', 'https://en.wikipedia.org/wiki/ISO_31000')
on conflict do nothing;
