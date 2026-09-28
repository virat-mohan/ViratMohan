# How to build here

## Design standard (applies to everything built and run)
Every page, dashboard, image and email must look calm, soothing and premium, fitting the concept it serves.
- Use the viratmohan.com palette and fonts (paper background, ink text, gold and terracotta accents; display, serif and sans fonts as in `case-study/brand.py`).
- Plenty of white space, one idea per screen, soft contrast, no clutter, no loud colours or gimmicks.
- Gentle motion only. One authored look, no dark mode, same as the homepage. All surfaces use /brand/tokens.css (https://viratmohan.com/brand/tokens.css). Works at phone width with no sideways scroll.
- If it isn't beautiful and easy on the eyes, it isn't done.

## Voice
Every ask explains why. Every task has a SMART goal and reports target vs actual.
Every report to Virat ends with the live links to what changed.
First person "I", never "we". Plain language. The CTA is "Let's talk." (WhatsApp). Never invent numbers; sample data is labelled as sample.

## Copy alignment
All copy (pages, dashboards, emails, posts, chat replies) must trace back to /mission:
- Passion: taking something good someone made and building the machine that gets it to the world.
- Mission: any founder, a working online business in 7 days, run for them, with results every Monday.
- Vision: a new, more efficient way for the world to do business.
- Ambition: build success stories with brands around the world, the responsible way. (Internal north star, not stated publicly yet: the largest AI company for businesses. Do not say it in any public copy, and never put a number on the ambition.)
Same terms, same numbers, same promises everywhere. If a line contradicts /mission, fix the line. Customer-facing brand stores keep their own brand voice.

## Hospitality
Every customer touchpoint follows the Hospitality section of case-study/PLAYBOOK.md: welcome, anticipate, remember, look after. Nothing is emailed, messaged or posted without Virat's approval.

## Tech beliefs
- Always learning: Every mistake becomes a rule. The same mistake never happens twice.
- Always auditing: The system checks its own work, all the time, not once a quarter.
- Better every time: Each run starts from what the last one learned.
- Ideal state: Know what perfect looks like, measure the gap, close it a little every day.
- Humans decide: Machines do the work. Money, people and promises stay with me.
In practice: read case-study/LEARNINGS.md before work, add to it after. Every fix ends with one lesson.

## Values
Responsible business, fair practice, transparency, collective growth, positive impact, efficiency, plain language, keep promises. See `/mission`. How to decide in any situation: `case-study/PLAYBOOK.md`.

## Content & performance calendar (the standard)
When Virat says "content and performance calendar", build it with `tools/calendar/render.mjs` from a spec JSON (see `tools/calendar/README.md`). It is the Ceremony Kitchen Diwali 2026 format: DevShop Retail OS + brand header, a Mon–Sun grid with the image, caption and a sourced "why" for every post and its ad tag, then the Meta Ads plan with weekly budgets, expected return (labelled as a target) and the rules the system runs by. Real numbers only, each traceable to the account or the store.

## Team: Prince, only when Virat says so
Prince Keshri is Retail OS Operations (brand onboarding and integrations). Email pr.prince.3068@gmail.com · WhatsApp +91 91400 67354. His work page: https://www.viratmohan.com/retail-os/ops/18192551-2bcc-4140-bb2b-6a44abb9c744 (tasks in `retail_os_ops_tasks`, member id `7ccc4990-12b8-424b-93cf-724645fbac69`, Supabase project vszjwgxvqoqyixpfthwl).
- Never assign Prince anything (no new tasks, no messages with work) unless Virat explicitly says so. If something looks like his work, recommend it to Virat with the why and wait for a yes.
- Try to do any technical step yourself first. Never share passwords or keys anywhere: access is by named invitation.
- Virat is customer-facing for every request from brands, founders and customers. Prince (and any other team member) does not contact them unless Virat explicitly allows it; the team prepares, Virat sends.
- Prince's scope is internal tech-stack connecting only, for all brands and for internal use: accounts, integrations, keys (by invitation), webhooks, templates, DNS, deploys, setup records. Not marketing, ads, content, catalog or data entry, commercial terms, or client contact.
## Master control
The viratmohan.com Claude Code session (repo "Virat Mohan Website", Supabase project vszjwgxvqoqyixpfthwl) is the master control for the whole DevShop Retail OS ecosystem: viratmohan.com, every client/brand backend and every agent. Central features, routines, agents and standards are decided there and must apply here too. If this repo is missing something the master has (a rule in its CLAUDE.md, a shared routine, the content & performance calendar standard, the lead journey, the ops tracker), bring it in line rather than inventing a local variant. Build shared things once centrally and consume them here; copy code only when it must run in this repo.

## Client access
Any access requested from a client to their accounts (Google Analytics, Search Console, Shopify staff, WordPress/WooCommerce, Shiprocket, any tool invite) is always for **tech@viratmohan.com**. Meta access is by the DevShop Business ID. The contact and sending address stays founder@viratmohan.com.

## Retail OS product architecture (the standard)
Retail OS is a standardised product, not a collection of bespoke client apps. Every brand gets the same Retail OS experience: one dashboard/page architecture, navigation philosophy, permissions, reporting conventions, task/approval model, AI interaction patterns and performance standards. The sequence is always: standardise → template → configure → measure → improve. Never: client request → bespoke build → new fork → repeat. A genuinely unique client need can still be built quickly, but it must be explicitly classified before it is allowed near the core.

Classify every capability into exactly one of:
1. Core Retail OS — every brand gets it.
2. Optional reusable Retail OS module — templated, turned on per brand.
3. Brand configuration — data/settings, not new code.
4. Client-specific extension — one client only; never forced into core.
5. Custom DevShop functionality — a Custom Build, outside Retail OS.

Standard capabilities to templatise as the product evolves (names are canonical; keep them): Brand Dashboard / Command Centre; Commerce; Orders; Products; Inventory Master; Customers; Marketing; Acquisition / Middle-of-Funnel / CRO; CRM / Leads; Growth Intelligence; Finance / Unit Economics; Operations; Reporting; AI / Brain; Tasks / Approvals; Integrations; optional Creator / Influencer; optional Experimentation. The canonical term is **Inventory Master** — do not rename it.

Client-specific today: **Ceremony Finance** and **Ceremony Ops** belong to Ceremony Kitchen. They are client-specific extensions, not core Retail OS modules.

Current environment model: each live brand is its own Supabase project + app (RETAIL_OS_LIVE_BRANDS). This is unchanged; no multi-tenancy decision has been made.

### Acquisition / Middle-of-Funnel (future capability)
Optimise ad/traffic → hook/intent → campaign experience → landing/splash → product discovery → trust/value → checkout → purchase. Eventually configurable per brand: campaign-specific landing experiences, ad-angle/hook mapping, product-specific journeys, brand splash screens, contextual storefronts, social proof, trust signals, risk-reversal, merchandising, A/B testing, funnel analytics, campaign attribution, conversion measurement. First laboratory: **Travaholic Caps** — but build it as a configurable Retail OS capability that another brand can turn on, never a one-off.

### Performance-first (standing requirement)
All customer-facing Retail OS pages are performance-first; performance is part of the architecture, not post-launch cleanup. Consider fast initial render, mobile-first performance, image optimisation, caching/CDN, minimal JS, third-party script discipline, efficient data fetching, loading and error states, responsive behaviour, and Core-Web-Vitals-style measurement with page-performance budgets. Targets are PROPOSED later once measurement exists — do not invent them.

### Funnel metrics (future capability)
Retail OS should eventually measure traffic → landing → engagement → product interaction → add-to-cart → checkout → purchase, attributable where data supports it to campaign, ad angle/creative theme, landing experience, product, audience and channel. Never fabricate metrics the system cannot yet produce.

### AE / Lead Operator (future capability)
When built, it reuses the existing Retail OS lead, communication, approval, audit and intelligence infrastructure — not an independent sales system. Not to be built until explicitly authorised.
