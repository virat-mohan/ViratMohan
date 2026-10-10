# Estate assembly: preserve, connect, standardise the interface

Written 2026-10-07 from the twelve repositories and the live control-plane registry, read-only. Typed source of every table below: `src/lib/brand-node/estate.ts`; the guard tests are `tests/unit/brand-node/`. Edit the data, not the tables. Nothing here deletes, renames or rebuilds any existing system. WiiZ is out of scope.

**Vocabulary** (exact, `src/lib/brand-node/states.ts`): CONTRACT_ONLY (interface, no runtime binding), PARTIAL (some runtime binding, not end to end), CONNECTED (runtime binding with a verified path), LIVE (connected and verified against the real deployed environment), SETUP_REQUIRED (built, needs external configuration or credentials), WAITING_FOR_HUMAN (a named person must act), DEFERRED, NOT_CONNECTED, UNKNOWN. The only LIVE claims today are the registry rows, read from the real control plane. Nothing else is called CONNECTED or LIVE, and a test enforces that.

## 1. Estate map

| Repo | System | Brand / client | Class | Status | Stack | Production | Owner |
|---|---|---|---|---|---|---|---|
| ViratMohan | DevShop control plane and viratmohan.com | DevShop | devshop-core | production | Astro, Supabase | yes | DS-02 Dev (DS-00 Virat approves) |
| retail-os-brand-config | @retail-os/brand-config contract package and the hardened starter | Retail OS | retail-os-package | active | TypeScript package (dist committed), Next.js starter | unknown | DS-02 Dev |
| ViratMohan | starters/next-brand-plane (older, dashboard-only starter) | Retail OS | retail-os-core | active | Next.js 14, Vitest | no | DS-02 Dev |
| moon-glasses | Moonglasses Retail OS store and admin | Moonglasses | retail-os-brand | production | Next.js 16, Supabase | yes | MG-01 Moon |
| Travaholic_caps | Travaholic Caps Retail OS store and admin | Travaholic Caps | retail-os-brand | production | Next.js 16, Supabase | yes | TC-01 Trav |
| ceremony-os | Ceremony Kitchen Retail OS client app with client-specific extensions | Ceremony Kitchen | client-extension | production | Next.js 16, Supabase | unknown | CK-01 Cera |
| korbi | KORBI Retail OS admin | KORBI (Ankay Holdings) | retail-os-brand | active | Astro, Supabase, Shopify read-only sync | unknown | KB-01 Kor |
| none (staged in ViratMohan) | Fresh For Paws Retail OS backend (staged) behind a WooCommerce store | Fresh For Paws | retail-os-brand | provisioning | Supabase SQL and Edge Functions (Deno); future Next.js brand plane | no | FP-01 Paws |
| thefeelingco | The Feeling Co static site and Flower Basket subscription app | The Feeling Co / FlowerBasket | custom-build | active | static HTML, Next.js 16 app with mock data | unknown | DS-02 Dev |
| indiacontemporary.net | India Contemporary art marketplace storefront | India Contemporary | archive | archive | Vite, React, Vercel functions, mock data | unknown | DS-02 Dev |
| Travaholic | Travaholic Stays villa marketplace (legacy) | Travaholic Stays | archive | archive | React CRA, FastAPI | unknown | DS-02 Dev |
| Content-ment | Content review app (purpose undocumented) | n/a | experiment | experimental | Next.js, Prisma, PostgreSQL | unknown | UNKNOWN |
| Coachyourpsyche | Coach Your Psyche AI counselling app | Coach Your Psyche | experiment | experimental | React CRA, FastAPI | unknown | UNKNOWN |
| Mystique | Mystique AI-curated art marketplace prototype | Mystique | experiment | experimental | React, FastAPI, MongoDB, Stripe | no | UNKNOWN |

Owners are agent ids from `src/lib/ceo/types.ts`; Virat (DS-00) approves money, people, promises and anything irreversible. Where a field could not be established the table says UNKNOWN or the data file gives the reason. Claude Projects are mapped in `ESTATE.md` section 4 and are unchanged.

## 2. Preservation audit

Rule applied: nothing is removed or rebuilt. KEEP = leave as is. CONNECT = keep and bind to the operating contract. ENHANCE = keep and extend. EXTRACT = a generic primitive worth sharing, extracted only after Virat agrees. DEFERRED = intentionally not now.

### Ceremony Kitchen (`ceremony-os`, class client-extension, fully preserved)
| Capability | Where | Decision | Why / risk |
|---|---|---|---|
| Inventory Master, recipes/BOM, stock movements, custom orders | `lib/inventory.ts`, `admin/(panel)/inventory`, migrations 0010/0011 | KEEP, CONNECT (adapter inventory capability) | the schema is generic for food brands; seed data and costing are Ceremony's. Medium risk: money costing logic |
| Vendors and purchasing | `purchasing/`, migration 0012 | KEEP | generic pattern, Ceremony data |
| Ceremony Finance (payment requests, bills, runs, petty cash) | `money/`, migration 0012 | KEEP as client extension | high risk: real money. Not moved into core |
| Approvals with WhatsApp alerts | `lib/approval-alerts/core.ts` and cron | KEEP; core logic is an EXTRACT candidate | pure, no I/O, tested. Interakt wiring stays Ceremony's |
| RBAC and per-user sessions | `lib/permissions.ts`, `proxy.ts` | KEEP; the `userMayAccess` pattern is an EXTRACT candidate | the permission list is Ceremony's. Security-sensitive |
| Write guard (fail-closed WRITE_MODE) | `lib/write-guard.ts` | KEEP; EXTRACT candidate | generic and small |
| Kitchen, SOPs, fragrance, catalog, proposals, brand voice | `kitchen/`, `sops/`, `fragrance/`, `catalog/`, `proposals/` | KEEP | Ceremony-specific |
| Ads, attribution, MIS, content calendar, integrations | `ads/`, `attribution/`, `mis/`, `lib/sync/*` | KEEP; CONNECT growth later | reads Shopify, Meta and Google |
| Admin shell (20 pages, hard-coded nav) | `app/admin/(panel)/layout.tsx` | KEEP, CONNECT via a mapping later | working; nothing removed. See section 5 |

### Fresh For Paws (no repo; backend staged in `retail-os-brands/freshforpaws/`, class retail-os-brand, status provisioning)
| Capability | Where | Decision | State, checked live 2026-10-07 |
|---|---|---|---|
| Standard Retail OS schema (orders, customers, products with Inventory Master fields, expenses, tracking, weekly_statements) | `supabase/migrations/0001_retail_os_core.sql` | KEEP, CONNECT | applied to Supabase `ksstmmmdvdpeygfzothu`, 11 tables, RLS on |
| WooCommerce webhook and sync connector | `supabase/functions/woo-*` | KEEP; reusable by any WooCommerce brand | deployed (v4); hourly sync running, last run ok: 27 products, 2 orders |
| Weekly statement with the agreed 25/25/10/40 split | `compute_weekly_statement()`, `app_settings` split keys | KEEP | split keys present (7); cannot compute yet: 0 of 27 products have cost, pack size or shelf life, no expenses |
| Brand voice checker and brand book | `lib/brand-voice.ts`, `BRAND-BOOK.md` | KEEP, ENHANCE | its test is not run by `npm test` or the release gate (P2) |
| Website mockups (three directions) | `public/preview/freshforpaws` | KEEP | design only |
| 23 ops tasks, application, lead | control plane | KEEP, CONNECT | board is stale: still lists "Deploy edge functions" as pending |
| Brand plane (Next.js), dashboard, Brand CEO runtime | none yet | SETUP_REQUIRED | needs a GitHub repo and a Vercel project from the founder; FP-01 is registered |

### Moonglasses (`moon-glasses`, production, MG-01)
All 41 admin pages and every capability are kept. Unique features preserved: creators (apply, agreement, scoring), virtual try-on and AI model photos, 35-item dynamic catalogue cart, Pay With A Post, WhatsApp catalogue checkout, bank-mail UPI matching, ad agent, 8 crons. Payment policy confirmed in code: COD off, card off, UPI on. The only change in flight is the pushed, unmerged branch `canonical-dashboard-shell` (`4895444`, 7 files, +508/-115, no page, route or API touched). CONNECT: adapter and health through the portfolio reader once registered. Decision needed (Virat): that branch is 34 commits behind `main`.

### Travaholic Caps (`Travaholic_caps`, production, TC-01)
All 32 admin pages and every capability are kept. Unique: Miles loyalty, performance manager (ROAS target and caps), checkout-health alerting, Shiprocket NDR/RTO flows, story series, brand voice guard on every send, the CEO agent charter (1 Oct 2026). The pushed branch `canonical-dashboard-shell` (`3c26476`, 8 files, +432/-80, nothing removed) builds on the Brand Foundation change that `main` has since reverted (`7356b0e`): a decision is needed before it merges. Open owner decision: the server still accepts `cod_advance` although COD is off in the UI.

### Korbi, The Feeling Co, and the rest
Korbi: KEEP; Astro admin (Command Centre, Orders, Products, Media, Integrations), database `dajglwnvrhrxryzjkjka`, production unconfirmed. The Feeling Co: KEEP; custom build on mock data. India Contemporary and Travaholic Stays: KEEP as archive and reusable IP. Content-ment, Coachyourpsyche, Mystique: KEEP as experiments. Nothing was archived or removed.

## 3. Connection matrix

| Brand | Registry | Adapter | Agent | Work Registry | Dashboard | Health | CRM | Growth | Finance |
|---|---|---|---|---|---|---|---|---|---|
| Moonglasses | LIVE | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NOT_CONNECTED | PARTIAL | PARTIAL |
| Travaholic Caps | LIVE | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | NOT_CONNECTED | PARTIAL | PARTIAL |
| Ceremony Kitchen | LIVE | CONTRACT_ONLY | PARTIAL | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED |
| KORBI (Ankay Holdings) | LIVE | UNKNOWN | PARTIAL | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | PARTIAL |
| Fresh For Paws | LIVE | SETUP_REQUIRED | PARTIAL | PARTIAL | SETUP_REQUIRED | SETUP_REQUIRED | NOT_CONNECTED | SETUP_REQUIRED | SETUP_REQUIRED |
| The Feeling Co / FlowerBasket | LIVE | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED | NOT_CONNECTED |

Per-cell evidence and the exact reason for every non-LIVE state are in `estate.ts` (`connections`). Reading it:
- **Registry LIVE** for all six brand nodes: the rows exist in the real `brands` table.
- **Adapter PARTIAL** for Moon and Travaholic: the code path exists (`retail-os-portfolio.ts`, `brand-node/adapter.ts`, tested) but whether they are in the production `RETAIL_OS_LIVE_BRANDS` is not visible from any repo. **Ceremony CONTRACT_ONLY**: the reader queries `orders`; Ceremony has `shopify_orders`. **Fresh SETUP_REQUIRED**: its database already uses the standard names; only the three Vercel env vars are missing.
- **Agent PARTIAL** for all five Brand CEOs: registered and routable in code and tests; the CEO runtime is not live.
- **Work Registry PARTIAL** where an agent exists, NOT_CONNECTED elsewhere: the registry is complete and tested but not wired live, and no brand repo calls it.
- **Health PARTIAL** for Moon and Travaholic: external black-box page checks only. No brand repo exposes a health endpoint.
- **CRM NOT_CONNECTED** everywhere: the control plane reads no customer data from any brand. **Growth and Finance PARTIAL** only through the portfolio reader.

## 4. Agent matrix

| Agent | Name | Role | Reports to | Scope | Capabilities |
|---|---|---|---|---|---|
| DS-00 | Virat | ceo | none | organisation | money, people, promises |
| DS-01 | Myoho | guardian | DS-00 | organisation | mission, values, voice, brand-book |
| DS-02 | Dev | ceo | DS-01 | organisation | operations, coordination, delegation, monitoring |
| MG-01 | Moon | brand_ceo | DS-02 | moonglasses | brand-operations |
| TC-01 | Trav | brand_ceo | DS-02 | caps | brand-operations |
| CK-01 | Cera | brand_ceo | DS-02 | ceremonykitchen | brand-operations |
| FP-01 | Paws | brand_ceo | DS-02 | freshforpaws | brand-operations |
| KB-01 | Kor | brand_ceo | DS-02 | korbi | brand-operations |
| DS-10 | Check | hod | DS-02 | organisation | quality, health-checks, audits |
| DS-11 | Grow | hod | DS-02 | organisation | growth, content, launches, social |
| DS-12 | Deal | hod | DS-02 | organisation | sales, leads, NDAs, proposals |
| DS-13 | Books | hod | DS-02 | organisation | finance, invoices, statements, P&L |
| DS-14 | Care | hod | DS-02 | organisation | customer-care, whatsapp-inbox, FAQ |
| DS-15 | Crew | hod | DS-02 | organisation | team, ops-checklist |
| DS-16 | Guard | specialist | DS-11 | organisation | visual-qa, brand-guardian, design-review, platform-compliance |
| DS-17 | Improve | specialist | DS-02 | organisation | improvement-detection, recurrence-analysis, root-cause-analysis, change-proposal, ptm-classification, process-mapping, standardisation, prevention, improvement-pipeline |

The registry already existed; what changed is that every Brand CEO scope is now a key the central registry and the Work Registry accept (Ceremony's was `ceremony`, which the Work Registry refuses), and a test proves it. Prince (P-01) is a person who receives work only through Virat. A new brand's CEO is WAITING_FOR_HUMAN until Virat approves it; there is no create flow, and none was built. Authority limits are in `src/lib/ceo/types.ts` (L4 approvals stay with DS-00).

## 5. Dashboard matrix

| Brand | Standard shell | Canonical data | Extensions kept | State |
|---|---|---|---|---|
| Moonglasses | branch `canonical-dashboard-shell` rewires nav to the 11 sections; all 41 pages mapped, none removed | package pinned `955bacb`; no health or metrics endpoint | try-on, models, creators, Pay With A Post | PARTIAL: pushed, unmerged, 34 behind main. Customers, WhatsApp and reviews were folded into Growth; Command Centre and Reports have no pages |
| Travaholic Caps | same on its branch; all 32 pages mapped | main pins `2c6054d`, branch `955bacb` | Miles, performance manager | PARTIAL: pushed, unmerged. Main reverted the Foundation change |
| Ceremony Kitchen | own sidebar, 20 pages in 8 groups, hard-coded; no package | none | inventory, finance, ops, kitchen, SOPs | NOT_CONNECTED to the standard shell. Preserved as is. Brand/Foundation has no page |
| Korbi | own Astro admin (5 areas) | none | per-unit fee metrics | NOT_CONNECTED |
| Fresh For Paws | none | none | WooCommerce connector | SETUP_REQUIRED: needs repo and Vercel project |

No dashboard code in any live brand repository was changed in this pass: those repos are one-writer, quiet-hour, preview-checked, and Prince deploys. What exists is a mapping of every page to a canonical section (Moon and Travaholic) and a plan for Ceremony (map its 20 pages to the 11 sections as data, keep every page). Module states for the navigation are the package's `live / setup_required / blocked / available` plus the client-specific states in `BRAND_CAPABILITIES`.

## 6. Self-serve journey

`src/lib/brand-node/journey.ts`: 15 stages read from facts that already exist, each with how it proceeds, whether it is implemented, and who must act.

| Stage | Proceeds as | Implemented | Human dependency | Gap |
|---|---|---|---|---|
| Discover | AUTO | yes | none | |
| Application | AUTO | yes | founder submits | |
| Qualification | WAITING_FOR_HUMAN | yes | Virat approves NDA, access and plan emails | auto-send is deliberately off |
| Commercial terms | WAITING_FOR_HUMAN | yes | Virat sends terms; founder signs | |
| Deposit | WAITING_FOR_HUMAN | yes | founder pays by UPI; Virat confirms | no gateway confirms it automatically |
| Brand created | WAITING_FOR_HUMAN | partial | Virat adds the brand in admin | nothing creates the row on deposit |
| Provisioning | WAITING_FOR_HUMAN | partial | Virat assigns the build; founder and team create accounts | assignment is a deliberate manual step |
| Foundation | WAITING_FOR_HUMAN | yes | founder answers the gaps | |
| Catalogue | WAITING_FOR_HUMAN | yes | founder supplies products, costs, photos | |
| Brand plane | SETUP_REQUIRED | partial | repo, Supabase, Vercel with credentials | the starter has never been provisioned into a real repo |
| Dashboard | AUTO | partial | none once deployed | |
| Brand CEO | WAITING_FOR_HUMAN | partial | Virat approves a new agent | no create flow |
| Health | AUTO | partial | none | no brand repo exposes a health endpoint |
| First operating action | AUTO | partial | none within guardrails | Work Registry not wired live |
| Monday result | AUTO | partial | none | metrics only for registered brands |

**Acceptance proof** (`tests/unit/brand-node/synthetic-onboarding.test.ts`, 11 steps, in memory, nothing live touched): a synthetic founder goes from entry to a closed first operating action using the real lead journey, Foundation lifecycle, catalogue gates, the real 18 setup tasks, the provisioning record, the adapter, the agent registry and the Work Registry (one accountable owner, verification by a different actor, closure with evidence, nothing left open). The steps that need a person or an external account are simulated and labelled as such. It proves the machine does everything around those steps and reports the truth at every stage; it does not prove the human steps happen.

## 7. Provisioning

One record per brand, derived (nothing is stored twice) from the brands row, the application, the Foundation, the ops setup tasks and the Work Registry item id, with an `observed` override for facts checked against the real system (`src/lib/brand-node/provisioning.ts`). It never creates tasks or marks anything done. Components: client, brand, agreement, payment, brand_registry, foundation, repository, database, environment, deployment, domain, payments, catalogue, commerce, email, whatsapp, analytics, team, agents, dashboard, health, go_live. States: NOT_STARTED, IN_PROGRESS, WAITING, BLOCKED, COMPLETE, FAILED. Assigning the build to the operations team stays Virat's decision (`assign-build`); until he does, `team` is WAITING on Virat.

**Fresh For Paws, computed from the real ops board and live checks on 2026-10-07:**

| Component | State | Owner | Detail |
|---|---|---|---|
| client | COMPLETE |  | Fresh For Paws |
| brand | COMPLETE |  | registered as building |
| agreement | COMPLETE |  | terms signed |
| payment | COMPLETE |  | deposit confirmed |
| brand_registry | COMPLETE |  | brands row, status building |
| foundation | NOT_STARTED | founder | no Foundation yet |
| repository | WAITING | founder | Create the freshforpaws-os Supabase project, GitHub repo and Vercel project |
| database | COMPLETE |  | observed: Supabase freshforpaws-os (ksstmmmdvdpeygfzothu) ACTIVE_HEALTHY, 11 tables, RLS on |
| environment | NOT_STARTED | team | Set Vercel env vars (FRESHFORPAWS NAME, URL, SERVICE_KEY) and redeploy viratmohan.com |
| deployment | IN_PROGRESS | team | observed: Edge Functions deployed; no Vercel brand plane |
| domain | NOT_STARTED | team | Record hosting provider, domain registrar and who holds each login (names only) |
| payments | NOT_STARTED | team | Record the current gateway and the bank account for weekly settlement; do not move payments until the legal view is in |
| catalogue | IN_PROGRESS | founder | observed: 27 products synced from WooCommerce; cost, pack size, shelf life missing on all |
| commerce | IN_PROGRESS | team | observed: woo-webhook and woo-sync deployed (v4); hourly sync ok: 27 products, 2 orders |
| email | NOT_STARTED | team | Brand email for Retail OS notifications on their domain; Resend domain verified |
| whatsapp | NOT_STARTED | team | Meta Business Manager partner request accepted; Business Verification submitted; templates created |
| analytics | NOT_STARTED | team | Connect GA4 + Search Console (tech@viratmohan.com as viewer) |
| team | COMPLETE |  | 23 setup tasks are on the operations tracker |
| agents | COMPLETE |  | Brand CEO FP-01 |
| dashboard | WAITING | team | brand plane not deployed (needs repository, database and deployment) |
| health | NOT_STARTED | team | no health reading |
| go_live | WAITING | virat | the registry status is set to live by a human; no go-live task is open |

Overall IN_PROGRESS, 8 of 22 complete, next actionable component: foundation (founder). The 7-day clock is **AT_RISK** (day 7, 0 days left, setup tasks still open before the go-live review). The existing stand-up rollup reads PROVISIONING. Before this change the rollup ignored the 8 `pending` tasks entirely.

## 8. The 7-day journey

`sevenDay()` reads the setup tasks, the clock start and today. ON_TRACK, AT_RISK (an open task past its due date, the last day with setup still open, or past day 7), BLOCKED (a blocked task, with its reason), COMPLETE. It names the owner of each risk and counts the later tasks waiting behind it. Day plan from `ops-seed.ts`: day 0 prerequisites and nameservers; day 1 to 2 payments and Shiprocket; day 3 WhatsApp and templates; day 4 webhooks and Instagram; day 5 ads, admin login, a real order; day 6 go-live review; day 7 go-live note and the first Monday.

## 9. Live dependencies

Only genuinely live-only work: deploy `8d3813e` and run the three live release-gate checks (Prince); register brands in the control plane's `RETAIL_OS_LIVE_BRANDS` (Virat, secrets); Fresh For Paws: GitHub repo and Vercel project, product costs, Meta, GA4, Razorpay and delivery inputs from the founder; any real merge of the dashboard branches into live brand repos (one writer, quiet hour, preview checked).

## 10. Remaining gaps

| P | Gap |
|---|---|
| P1 | No brand repo exposes a health or metrics endpoint, so the control plane cannot see app, payments, orders or fulfilment health for any brand |
| P1 | Fresh For Paws is on day 7 with the brand plane, product costs and several accounts outstanding |
| P1 | Moon and Travaholic dashboard branches are unmerged and stale against their `main` (Travaholic's `main` reverted the Foundation they depend on) |
| P2 | Brand creation and build assignment on deposit are manual; a safe idempotent version is possible but touches a money-path handler and Prince's assignments, so it was not wired |
| P2 | Ceremony reads none of the control plane and has no package dependency, 2 test files and no typecheck script |
| P2 | Two starters exist; the one in ViratMohan is older |
| P2 | `ViratMohan` branch `claude/laughing-gates-hgqo0o` is 9 commits behind `origin/main` and 60 ahead; not merged |
| P2 | Fresh's brand-voice test is not run by any gate; the ops board for Fresh is stale |
| P3 | Travaholic's server still accepts `cod_advance`; Korbi and The Feeling Co status drift between the registry, ESTATE and the repos |
