-- DevShop Retail OS — move the business plan to an editable driver model.
-- Run this once in the Supabase project's SQL editor.

alter table retail_os_business_plans add column if not exists drivers jsonb;
-- { ordersM1, ordersM2, ordersM3, aovInr, cogsPct, cacPct, adminTechPct } —
-- the source of truth from here on. months/quarter_totals stay as
-- computed-and-cached columns, recomputed from drivers on every generate
-- AND every human edit (see computePlanFromDrivers() in
-- src/lib/retail-os-business-plan.ts) — never hand-edited directly.

-- research_notes was a required pasted-research field; the model now does
-- its own research via the native web search tool, so this becomes an
-- optional extra-context field an admin can still add.
alter table retail_os_business_plans alter column research_notes drop not null;
alter table retail_os_business_plans alter column research_notes set default '';
