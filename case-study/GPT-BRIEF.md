# Brief for an outside review (paste everything below the line into ChatGPT)

Built from the repo on 2026-09-27. Every fact names its source file. Nothing here is invented. "Not found" means I searched the code and it isn't there.

---

You're reviewing my business as a tough, fair operator, CFO and CTO combined. I'm Virat Mohan. Below is everything my build system (Claude, working in my code repo) knows about the business, with sources. Read all of it, then give me Parts A, B and C at the end.

Rules for your answer: don't invent numbers or facts. If you propose a target, label it PROPOSED. If something is missing, write "UNKNOWN: <question for Virat>". Be direct and specific. No hype.

## 1. Who I am
- Positioning: "I build the machine that gets good products to the world." Thesis: "AI makes doing the work cheap. Good judgment is still rare. I let machines do the routine and keep people for what needs people." (src/data/site.ts)
- Based in Gurugram, India. Entity on the site: Opportunities Unlocked LLP. (src/data/site.ts)
- Education: Don Bosco School, The Shri Ram School, LSE, Bayes Business School (Cass). Qualified ACA (chartered accountant). MCSE and C++ certified from age twelve.
- Career:
  - 2002, Praxis Technologies: computer hardware trade, UAE to India.
  - ~2005, GM India, Surya Henna, a Brazilian hair-colour brand.
  - ~2008, KPMG London and HSBC statutory audits.
  - 2009–2014, Perfect Ice: a D2C ice brand with home delivery, founded by my father and revived by me. Production, cold chain and last mile.
  - 2010, Delhi on the Go: a free daily newspaper for commuters, funded by ads.
  - ~2010, Marblex India: concrete pavers for the Commonwealth Games.
  - 2013–2020, Pita Pit: regional director, then India CEO. Also the UK, UAE, KSA and Singapore. Units 6 to 21, revenue quadrupled.
  - 2020–2022, Kitchen Plus India (CloudKitchens®), Country GM: 122 cloud kitchens across three cities in under 24 months, 90% occupancy in 12 months, 25+ enterprise F&B brands.
  - 2022–2025: Daryaganj CBO and CFO ($2M raised in equity and NCDs; valuation doubled to ₹150 Cr in 18 months). Then Chief of Staff at Foodlink through a pre-IPO round.
  - 2024 to now: ClarityHQ and DevShop.
- Outside work: ex-President of The Shri Ram School Alumni Society (2016–2023), keyboardist since age four (band: Anachronox), learning to DJ, marathon training, longevity.

## 2. Mission, vision, values
- Passion: taking something good someone made and building the machine that gets it to the world. (CLAUDE.md)
- Mission: any founder, a working online business in 7 days, run for them, with results every Monday. Longer form: "…and prove it in public with real numbers." (CLAUDE.md, case-study/MISSION.md)
- Vision, public form: a new, more efficient way for the world to do business. (CLAUDE.md)
  Internal form: "one operator plus machines running thousands of brands better than a full in-house team, paid only from the value it creates, and sharing that value with everyone who helps." (MISSION.md)
- Ambition, public form: build success stories with brands around the world, the responsible way.
  Private north star, never stated publicly: become the largest AI company for businesses. (CLAUDE.md)
- Values: responsible business, hospitality, fair practice, transparency, collective growth, positive impact, efficiency, plain language, keep promises. (src/pages/mission.astro)
- Decision test, applied in order (case-study/PLAYBOOK.md):
  1. Honest.
  2. Fair.
  3. Keeps promises.
  4. Creates real value.
  5. Can a machine do it? If it involves money, legal risk or judgement, it goes to me.
  6. Calm and beautiful.
- I must approve: money moving, pricing or terms, legal or tax, public claims, hiring, investors, anything irreversible, and customer data. Nothing is emailed, messaged or posted without my approval. (PLAYBOOK.md, CLAUDE.md)
- Tech beliefs:
  - Every mistake becomes a rule.
  - The system audits itself constantly.
  - Each run starts from the last run's lessons.
  - Measure the gap to ideal and close it daily.
  - Humans decide. (CLAUDE.md)

## 3. The businesses
### Retail OS (the main product)
- What it is: one system that runs an online brand. It covers storefront, admin, payments, shipping, WhatsApp, Meta ads, content and reporting. I operate it with the founder. (public/retail-os/faq/faq-data.js)
- Promise: live in 3–7 days after signing. The code uses a 7-day build window. (FAQ, src/lib/retail-os-db.ts)
- Deposit: ₹5,000, the only upfront payment, fully adjusted against onboarding tech costs. Zero capex. (public/retail-os/index.html)
- Pricing, three models (FAQ, index.html):
  - Profit share: 40% of the profit pool is standard.
  - Revenue share: 15–20% of D2C revenue.
  - Retainer: from ₹2.5 lakh a month, for brands doing ₹1 crore+ a year.
  - In all three, ad spend is the brand's, at cost.
- Revenue model per brand: product ≤25%, marketing (CAC) ≤25%, admin ≤10%, leaving a profit pool of about 40%. (src/pages/retail-os/terms/[id].astro, src/lib/retail-os-business-plan.ts)
- Contract (src/lib/retail-os-terms.ts):
  - 12 months, with a 30-day break clause. The break fee is 5% of revenue to date.
  - Brand IP stays with the founder.
  - AI-Enabler / Co-Founder model, for brands built from zero: DevShop holds 50% of the brand IP.
- Settlement: all customer payments land in DevShop's account first. Each Monday–Sunday week is settled the following Monday by 1 PM, with an itemised statement. (retail-os-terms.ts)
- Categories open: jewellery, beauty and skincare, men's grooming, pet accessories, home décor, apparel. (FAQ)
- Founding 10 slots, from index.html: "Two brands selling, two more launching. Six slots are open."
- Founder journey: WhatsApp me → tracker page with a quarterly forecast and three store designs → sign → deposit → build → go-live. (FAQ)
- Features (FAQ):
  - Store and checkout: custom store, guest checkout, pincode autofill, COD with or without an advance, UPI order matching.
  - Shipping and returns: auto courier booking, RTO nudges, auto restock on returns.
  - WhatsApp: catalog, order updates, reviews, cart reminders then a coupon, win-back.
  - Loyalty and referrals.
  - Content: AI images and video from one product photo.
  - Ads: Meta ads drafted from sales data and held paused until approved.
  - Reports: daily email summary, daily Meta report, monthly P&L, weekly statement.
  - Store tuning with Microsoft Clarity heatmaps.

### Pay with a Post (I own 100%, same as DevShop and Retail OS)
- A customer gets their order in exchange for an Instagram post. (src/content/work/pay-with-a-post.md)
  - Gift-first: shoppers with more than 5,000 verified followers get the order shipped on trust. They put a one-time code in their bio and must post within 12 hours of delivery.
  - Sell-first: everyone else gets a code, and their order ships after 3 real paid orders.
  - The code is a full-price coupon, used for attribution rather than as a discount.
- Fee: 1% of the GMV it drives, charged only once payment lands. It shipped first on Moonglasses. (public/retail-os/index.html, retail-os-terms.ts)

### DevShop (custom AI builds)
- Methodology, 8 stages: Diagnose, Framework, P&L Map, Mechanism, Validate, Demo, Feedback, Build. The pitch: a working demo in about two minutes, then a 30-day build. (src/pages/devshop/methodology.astro, src/lib/retail-os-chat.ts)
- Verticals, all live: Restaurants, Bars & Hotels; D2C E-commerce; Retail; Real Estate & Property Management. (src/data/devshop-verticals.ts)
- Pricing (src/pages/devshop.astro):
  - Build: priced on request.
  - Retainer: ₹50,000 a month. Also US $1,700, UK £1,200, UAE AED 5,000.
  - Each additional module: 50% of the first.
- A P&L lever taxonomy tags every claim known, assumed or needs confirmation. It never uses fabricated percentages. (src/lib/pnl-levers.ts)
- The /devshop page is a dark standalone prototype. Its login, dashboard, orchestrator and billing are UI-only simulations. (src/pages/devshop.astro)

### ClarityHQ, Advisory, Partners
- ClarityHQ: an AI-native growth practice built from a brand intelligence layer, human pods and a distributed specialist network. (src/pages/clarityhq.astro)
- Advisory: due diligence, financial modelling, capital allocation, GCC and India market entry, turnarounds, and DRHP/IPO readiness. Covers India, the UAE and the UK. (src/pages/advisory.astro)
- Partners: earn 25% of what I earn from each brand they bring, for as long as it stays. They sign an NCNDA and track it on a dashboard. (src/pages/partners.astro)

## 4. Clients and results
- Brand status (FAQ, the single source):
  - Travaholic Caps: on the full system.
  - Moonglasses: live and selling offline, with the online store going live soon.
  - Ceremony Kitchen: uses it for social and performance marketing.
  - India Contemporary and Flowerbasket: launching.
- Published result, on an unnamed D2C brand: after Retail OS took over the ads from a human, sales per day rose 59% in the first 3 days (₹880 to ₹1,399 a day). The biggest day ever was ₹4,197. Small base, early days. (src/lib/retail-os-chat.ts)
- Other DevShop work (src/content/work/*.md):
  - Travaholic store: live in 2 days.
  - Travaholic Stays: 12 villas, with Airbnb sync.
  - India Contemporary: an art platform with four artists.
  - The Feeling Co.: a wedding-planning site.
  - ClarityHQ, Content-ment, Coach Your Psyche: built, not live.
- Proof targets (case-study/WOW-TARGETS.md), each against the best public competitor:
  - Payment recovery: 35%+ (competitor: 12–30%).
  - Checkout→paid: 2× (23%→46%).
  - Win-back: 5% of 566 past buyers.
  - Blended ROAS: 4×+.
  - Time to live: under 7 days to the first order.
  - First 10 days: +100% daily revenue.
  - RTO: under 5%.
  - Repeat purchase: 40%+ (currently 5 of 12 = 42%, small base).
  - Engagement: 12%+ per SCS post (a founder post hit 12.2%).
  - Status: several are "measure now" or pending data. Travaholic lost 30 of 39 payment attempts, per the diagnosis.

## 5. How it's built
- Stack: Astro 5 on Vercel, Supabase (Postgres), Claude (Sonnet for routine work, Opus for high stakes), Gmail API (sends as me), Resend (fallback), WhatsApp Cloud API, RazorpayX (payouts). Lead connectors read Shopify, Meta, GA4 and Search Console, read-only. (package.json, src/lib/env.ts)
- Scheduled jobs (vercel.json):
  - Daily, weekly and monthly brand reports.
  - Monday settlement and payout: a dry run unless enabled, with per-payout and weekly caps.
  - An outbox that holds messages until 9am–8pm IST, Mon–Sat.
  - Lead mail every 10 minutes: reads Gmail, logs leads and drafts replies for my approval.
  - Daily reminders for leads stalled more than 48h.
- Agents and automations in code:
  - Lead mail assistant.
  - Site chat.
  - WhatsApp ledger ingest: only allowlisted senders. Brand detected by rules, then Claude, then asking. Has undo, and a review queue.
  - Settlement engine: pure functions, integer paise, reconciles gateway and COD remittances, carries negative balances forward.
  - Double-entry ledger.
  - Business plan generator: the LLM gives drivers only, and the maths is deterministic.
  - Lead audit engine: sourced figures and the 3 biggest gaps.
  - Plan writer: any digit outside a placeholder rejects the draft.
- CRM: the leads table runs through new → contacted → nda_sent → nda_signed → discovery → proposal → won/lost/paused. Every outbound draft waits for my approval through a signed link. There is a CSV fallback for Shopify, Amazon, Flipkart, Meta, GA4 and GSC exports. (migrations/0035–0037, src/lib/lead-*.ts)
- Dashboards:
  - /retail-os/admin: applications, leads, FAQ inbox, founder console, reports, business plans, design directions.
  - /devshop/admin: queries, frameworks, AI agent library, AMC rates, use cases.
  - /dashboard: the brand dashboard, currently sample data.
  - Partner dashboard.
  - Client tracker pages.
  - Ops tracker (retail_os_ops_tasks).
- The Brain (src/lib/brain, migrations 0033/0038/0039):
  - What it holds: one knowledge store of entities, facts, rules and events, each with a source and a visibility of public, partner or staff.
  - Operations: recall, answer (cited, or "I don't know" and ask Virat), classify (rules first, then Claude), learn, decide, communicate.
  - Learning: a correction creates a rule and retires the wrong one.
  - Knowledge loop: unanswered chat or email questions go to my FAQ inbox, and publishing an answer makes it a Brain fact.
  - Seed: loaded from repo docs, 188 facts, and it flags unread docs. A number is kept only if it appears verbatim in its source.
  - Decisions: "act alone vs ask Virat" is deterministic code, not a model call.
- Quality:
  - 15 unit test files and 5 live Claude benchmarks.
  - A regression map of 19 failure modes.
  - A brand-token drift check.
  - A LEARNINGS.md log (12 lessons so far) that every run reads first.
- Marketing: SCS (Successful Case Study) images from Python scripts in the brand look, Instagram @vmviews, LinkedIn, and a "Let's talk." WhatsApp CTA on everything.

## 6. Legal
- Documents: the NCNDA and the Partnership Terms (.docx in public/retail-os/docs/).
- Signed terms are frozen into a signature record per brand. (src/lib/retail-os-terms.ts)
- The brand setup form collects GSTIN.
- Not found: DevShop's own GSTIN, a public privacy policy or terms-of-use page, and data-processing terms for customer data held on brands' behalf.

## 7. Gaps and conflicts found in the repo (review these)
1. The playbook says a self-audit runs every 4 hours. No such job is in the code or the crons.
2. WOW-TARGETS lists "ads autopilot live since 24 Sep", cart-recovery sweeps and an image generator. None of that code is in this repo, so it may live elsewhere (the Travaholic or Ceremony repos). UNKNOWN which.
3. Pricing differs across products:
   - Travaholic work page: ₹1.5–4L to own, ₹15–40k a month managed, or 1–3% of sales.
   - Retail OS: 40% profit share, 15–20% revenue share, or ₹2.5L a month.
   - DevShop: ₹50k a month.
   No single rate card ties them together.
4. Mission wording: MISSION.md says "product founder" and "commerce". CLAUDE.md and /mission say "any founder" and "the world to do business".
5. The /devshop page is a dark prototype with simulated login and billing. It is outside the one-look standard, and it's live.
6. Some case studies are marked "TODO: confirm cleared for public naming", and the LinkedIn handle is marked "TODO: confirm".
7. There is no CI: no GitHub workflows. Migrations 0038 and 0039 were applied by hand, two migrations share the number 0028, and there is no 0030.
8. The Brain seed is not loaded into production yet. It needs a manual `--apply`.
9. Staffing plan (MISSION.md): about 3.5h of setup and 1.75h a week per brand. 25 brands in month 1 means about 180h, which is Virat plus 1 launch associate. Every approval still routes through me, so I'm the bottleneck.
10. Everything runs from one inbox, one WhatsApp number and one person's approval.

---

## What I want back

**Part A. Review and audit.** For each area below give me what's strong, what's weak or risky, and the one highest-leverage fix:
- Strategy and positioning: Retail OS, DevShop, ClarityHQ and Advisory. Is it one company or four?
- Offer, pricing and commercial terms, including the break fee, settlement flow and IP terms.
- Go-to-market and marketing: the SCS engine, Pay with a Post, partners.
- Tech architecture, debugging and testing, and how mistakes become rules.
- The Brain and memory: is the design right for a system that learns and scales to thousands of brands?
- Agents: how they're created, controlled, approved and measured. Which new agents I need.
- Legal, tax and financial risk. Specifically money flowing through my account, payouts, GST, data protection (India DPDP Act), and IP.
- Me as the bottleneck: what stays with me, what gets automated, what goes to a team.

**Part B. How to improve everything.** A ranked list of the 15 most valuable changes, with effort (S/M/L) and expected impact.

**Part C. Roadmap to a large global enterprise, fastest and most efficient path, done responsibly.**
- 7 days, 30 days, 90 days, 12 months, 3 years. For each: what to build, what to sell, to whom, through which channel, and one SMART goal (mark targets PROPOSED).
- The order of categories and countries to enter, and why.
- The unit economics that have to be true at each stage.
- Hires and partners, and when.
- Funding: bootstrap vs raise, and when.
- The 5 biggest risks and how to de-risk each.
- The 3 things I should stop doing.

Use markdown with clear headings. Be specific to this business, not generic advice.
