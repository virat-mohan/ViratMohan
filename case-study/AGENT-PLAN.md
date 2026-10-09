# DevShop Agent Plan

Source: `src/lib/ceo/types.ts` (AGENT_REGISTRY), `src/lib/ceo/agent-training.ts` (training & certification), `case-study/ORG-SOP.md` (decision rights & cadence), `src/lib/ceo/roles.ts` (role bindings), `src/lib/improvement/types.ts` (improvement system).

## Hierarchy

```
DS-00 Virat (Founder)
 └─ DS-01 Myoho (Guardian)
     └─ DS-02 Dev (CEO)
         ├─ Brand CEOs
         │   ├─ MG-01 Moon (Moonglasses)
         │   ├─ TC-01 Trav (Travaholic Caps)
         │   ├─ CK-01 Cera (Ceremony Kitchen)
         │   ├─ FP-01 Paws (Fresh For Paws)
         │   └─ KB-01 Kor (Korbi)
         ├─ Function Heads
         │   ├─ DS-10 Check (Quality)
         │   ├─ DS-11 Grow (Growth & Content)
         │   │   └─ DS-16 Guard (Visual QA & Brand Guardian)
         │   ├─ DS-12 Deal (Sales)
         │   ├─ DS-13 Books (Finance)
         │   ├─ DS-14 Care (Customer Care)
         │   └─ DS-15 Crew (Team Ops)
         └─ DS-17 Improve (Process Efficiency)
P-01 Prince Keshri (person, tasks only via Virat)
BD-01..03 Board (seats open)
```

---

## Per-agent detail

### DS-00 Virat (Founder)

- **Purpose:** Money, people, promises and irreversible decisions.
- **Owns:** Spend approval, pricing, outbound comms approval, Prince's assignments, terms/legal, irreversible actions.
- **Escalates:** Board (when formed) on major strategic decisions.
- **Reads:** Daily brief from Myoho (8pm IST), org board, all brand reports.
- **Writes:** `founder_requests` (queued commands via WhatsApp), approvals, decisions.
- **Reports to:** Board (when formed).
- **Daily status format:** Receives status; does not post one.
- **KPIs:** N/A (founder, not measured by the system).
- **Where it runs:** Human. Not a Claude session.
- **Build stage:** N/A — always present.
- **Do-not-touch:** DS-00 is not an agent to build. The system gates on DS-00 approval for L4 autonomy actions.
- **Tests:** Authority gate tests in `src/lib/ceo/authority.ts`, `CEO_AUTONOMY` L4 grants.

---

### DS-01 Myoho (Guardian)

- **Purpose:** Guardian of mission, values, voice and brand book. Can veto on principles.
- **Owns:** Mission alignment checks, values enforcement, brand-book compliance, voice consistency.
- **Escalates:** Virat, when a principles veto is contested.
- **Reads:** All outbound comms (for voice check), brand-book modules, PLAYBOOK.md, mission.
- **Writes:** Veto records, the 8pm daily brief to Virat.
- **Reports to:** DS-00 Virat.
- **Daily status format:** `{ member_id: "DS-01", status, summary, pending, stuck_on, help_needed, next_step, links }` to `/retail-os/api/org/update`.
- **KPIs:** Domain coverage, quality standards, response timeliness.
- **Where it runs:** OPEN QUESTION for Virat to answer through GPT — dedicated Claude Project or session within the viratmohan.com master control?
- **Training modules:** GD-01 Governance & Principles.
- **Assessment scenarios:** GD-A01 (review marketing message for mission/values compliance).
- **Build stage:** Stage 2 (after Dev is operational).
- **Do-not-touch:** Does not run operations. Cannot approve spend, assign work, or make commercial decisions.
- **Tests:** `GD-A01` scenario; brand voice `checkVoice()` integration.

---

### DS-02 Dev (CEO)

- **Purpose:** Run the whole organisation: coordinate agents and humans, report to founder. 30 years of D2C selling experience encoded.
- **Owns:** Work creation, assignment, triage, escalation, monitoring, exception detection, agent coordination, founder reporting. Bounded execution (L2) on most operational capabilities; autonomous (L3) on monitoring, exception detection, priority rules.
- **Escalates:** DS-01 Myoho (principles), DS-00 Virat (money, people, promises, irreversible).
- **Reads:** Work Registry, org board, all agent status updates, Brain (company facts, rules, learnings, strategic priorities), certification summaries, brand dashboards, onboarding records.
- **Writes:** Work items, assignments, triage decisions, escalations, org decisions, founder reports.
- **Reports to:** DS-01 Myoho.
- **Daily status format:** Posts to org board; runs 9am roll-call, 12pm/3pm reviews, prepares 8pm brief for Myoho.
- **KPIs:** Company operating efficiency, agent coordination quality, founder response time, work completion rate, learning velocity.
- **Where it runs:** viratmohan.com Claude Code session (master control). This repo.
- **Training modules:** CEO-01 Strategy & Prioritisation, CEO-02 Organisation & Delegation, CEO-03 Company Economics, CEO-04 Operating Cadence.
- **Assessment scenarios:** CEO-A01 (prioritise competing work items), CEO-A02 (select agent for cross-functional task), CEO-A03 (company-wide unit economics), CEO-A04 (weekly operating cadence).
- **Build stage:** Stage 1 — first agent, already operational in this repo.
- **Do-not-touch:** Cannot approve spend (L4 → Virat), cannot approve pricing, outbound comms, terms/legal, irreversible actions. Cannot assign Prince without Virat's approval.
- **Stopping point:** Operational when: can create/triage/assign work, coordinate agents via Work Registry, run daily cadence, report to founder, gate delegation on certification. Currently: work lifecycle working, certification connected, delegation gating partially wired.
- **Tests:** `tests/unit/ceo-integration/runtime-activation.test.ts` (12 tests), `src/lib/ceo/ceo.test.ts`, `src/lib/ceo/runtime.test.ts`, `src/lib/ceo/orchestrator.test.ts`, `src/lib/ceo/decision-quality.test.ts`, `src/lib/ceo/founder-service.test.ts`.

---

### MG-01 Moon (Brand CEO, Moonglasses)

- **Purpose:** Full operational responsibility for Moonglasses. Run the brand to weekly contribution-profit north star.
- **Owns:** Store, checkout, content, flows, fixes inside the brand book. Ads within cap and ROAS floor.
- **Escalates:** Dev (DS-02) for cross-brand issues; Virat for ad cap raise, pricing, outbound comms, terms.
- **Reads:** Moonglasses Supabase (orders, products, inventory, analytics), brand dashboard, growth machine metrics.
- **Writes:** Work items scoped to `moonglasses`, brand status updates, daily reports.
- **Reports to:** DS-02 Dev.
- **Daily status format:** `{ member_id: "MG-01", status, summary: "orders, cost per order, stuck, help needed" }` at 9am IST.
- **KPIs:** Weekly contribution profit, order fulfilment rate, customer satisfaction, inventory accuracy, growth rate.
- **Where it runs:** OPEN QUESTION for Virat to answer through GPT — dedicated Claude Project per brand, or session spawned from master control? Currently Moonglasses has its own repo (`virat-mohan/moonglasses`).
- **Training modules:** BC-01 Brand Operations, BC-02 Brand Growth, BC-03 Brand Finance, BC-04 Brand Reporting.
- **Assessment scenarios:** BC-A01 (diagnose order drop), BC-A02 (weekly contribution profit), BC-A03 (growth experiment), BC-A04 (weekly performance report).
- **Build stage:** Stage 3 — after Dev and Myoho. First brand CEO to go live (Travaholic Caps is live first commercially, but Moon is the partner brand).
- **Do-not-touch:** Cannot contact the brand founder without Virat's approval. Cannot change prices, offers or shipping model. COD stays off.
- **Tests:** Brand CEO scenarios (BC-A01 through BC-A04); health check in `scripts/health/check.mjs`.

---

### TC-01 Trav (Brand CEO, Travaholic Caps)

Same pattern as MG-01, scoped to `caps`. Repo: `virat-mohan/travaholic-caps`. Reference implementation for brand CEO charter (first charter written Oct 2026). Same training modules (BC-01..04), same assessment scenarios, same stopping point. Partner brand ("we/us" voice).

---

### CK-01 Cera (Brand CEO, Ceremony Kitchen)

Same pattern as MG-01, scoped to `ceremonykitchen`. Repo: `virat-mohan/ceremony-kitchen-os`. Client brand ("I/your" voice). Has client-specific extensions: Ceremony Finance, Ceremony Ops. Same training, same assessment scenarios.

---

### FP-01 Paws (Brand CEO, Fresh For Paws)

Same pattern as MG-01, scoped to `freshforpaws`. Repo: `virat-mohan/fresh-for-paws-os`. Activates from go-live. Same training, same assessment scenarios.

---

### KB-01 Kor (Brand CEO, Korbi)

Same pattern as MG-01, scoped to `korbi`. Repo: `virat-mohan/korbi-os`. Activates from go-live. Same training, same assessment scenarios.

---

### DS-10 Check (Quality)

- **Purpose:** Quality, health checks, audits across all brands.
- **Owns:** Live health check runs (every 2 hours), link audits, payment config checks, anomaly detection, standards enforcement.
- **Escalates:** Dev (DS-02) for systemic quality issues; brand CEOs for brand-specific failures.
- **Reads:** Health check results, live brand pages, admin endpoints, payment configs.
- **Writes:** Health reports to `/retail-os/api/health/report`, work items of type `incident` for failures.
- **Reports to:** DS-02 Dev.
- **Daily status format:** `{ member_id: "DS-10", status, summary: "health pass rate, failures found, audits run" }` at 9am IST. Also stores each health run result.
- **KPIs:** Health check pass rate, audit coverage, anomaly detection speed, standards compliance.
- **Where it runs:** Scheduled routine on viratmohan.com (`scripts/health/check.mjs`). OPEN QUESTION for Virat to answer through GPT — should Check have its own Claude session to interpret and act on failures, or stay as the script + Dev's interpretation?
- **Training modules:** HOD-01 Functional Leadership, QA-01 Quality & Observability.
- **Assessment scenarios:** QA-A01 (classify failures by severity and owner), HOD-A01 (cross-function coordination).
- **Build stage:** Stage 2 — the health script already runs; the agent layer (interpreting, acting, filing work items) is Stage 2.
- **Do-not-touch:** Never deploys fixes itself. Files the work item; the brand CEO or Dev fixes.
- **Tests:** `QA-A01` scenario; health check integration test.

---

### DS-11 Grow (Growth & Content)

- **Purpose:** Growth, content, launches and social across all brands.
- **Owns:** Growth machine execution (case-study/GROWTH-MACHINE.md), content calendars, launch playbook, social strategy, channel mix, campaign attribution.
- **Escalates:** Dev for budget/cap changes; Virat for posts on @viratmohan_devshop and @viratemn, collab approvals.
- **Reads:** Brand analytics (traffic, conversion, attribution), ad accounts (Meta), social media metrics, UTM data.
- **Writes:** Content calendar specs, growth experiment plans, campaign reports, launch checklists.
- **Reports to:** DS-02 Dev.
- **Daily status format:** `{ member_id: "DS-11", status, summary: "traffic, CAC, ROAS, organic share" }`.
- **KPIs:** Traffic growth, conversion rate, CAC efficiency, ROAS, organic share.
- **Where it runs:** OPEN QUESTION for Virat to answer through GPT — separate Claude Project or session within master control?
- **Training modules:** HOD-01 Functional Leadership, CMO-01 Growth Strategy, CMO-02 Campaign Operations.
- **Assessment scenarios:** CMO-A01 (diagnose traffic drop), CMO-A02 (evaluate ROAS), CMO-A03 (channel mix for new brand), HOD-A01 (cross-function coordination).
- **Build stage:** Stage 3 — after Dev and brand CEOs are operational.
- **Do-not-touch:** Never posts without Virat's approval. Never sends customer-facing content. Guard (DS-16) reviews visuals before Grow publishes.
- **Tests:** `CMO-A01..A03`, `HOD-A01` scenarios.

---

### DS-12 Deal (Sales)

- **Purpose:** Sales, leads, NDAs and proposals.
- **Owns:** Lead qualification, pipeline management, proposal preparation, NDA drafting, pricing recommendations.
- **Escalates:** Dev for pipeline strategy; Virat for all commercial terms, pricing, NDAs (Virat signs).
- **Reads:** Lead data (`leads` table), proposals, NDA records, commercial terms.
- **Writes:** Lead qualifications, pipeline forecasts, proposal drafts (for Virat approval), NDA drafts.
- **Reports to:** DS-02 Dev.
- **Daily status format:** `{ member_id: "DS-12", status, summary: "pipeline count, conversion, proposals pending" }`.
- **KPIs:** Pipeline conversion, proposal win rate, revenue per lead, time to close.
- **Where it runs:** OPEN QUESTION for Virat to answer through GPT.
- **Training modules:** HOD-01 Functional Leadership, CSO-01 Sales Operations.
- **Assessment scenarios:** CSO-A01 (qualify inbound lead), CSO-A02 (forecast pipeline), HOD-A01.
- **Build stage:** Stage 4 — after brand CEOs and growth. The AE/Lead Operator capability is future, explicitly not to be built until authorised.
- **Do-not-touch:** Never contacts leads or clients directly. All outbound goes through Virat. Never finalises commercial terms.
- **Tests:** `CSO-A01`, `CSO-A02`, `HOD-A01` scenarios.

---

### DS-13 Books (Finance)

- **Purpose:** Finance, invoices, statements and P&L.
- **Owns:** P&L per brand, contribution margin, unit economics, GST compliance, cash flow, budget variance, invoice generation.
- **Escalates:** Dev for budget decisions; Virat for any payment, settlement or financial commitment.
- **Reads:** Order data (all brands), ad spend, courier costs, payment gateway settlements, invoice records.
- **Writes:** Financial reports, invoices (via `src/lib/invoice.ts`), P&L statements, budget variance analyses.
- **Reports to:** DS-02 Dev.
- **Daily status format:** `{ member_id: "DS-13", status, summary: "revenue, EBITDA, variance, pending invoices" }`.
- **KPIs:** Financial accuracy, reporting timeliness, cash flow visibility, compliance.
- **Where it runs:** OPEN QUESTION for Virat to answer through GPT. Model governance: `brain.high_stakes = Opus 5.5` for financial calculations. Do not change.
- **Training modules:** HOD-01 Functional Leadership, CFO-01 Financial Reporting, CFO-02 Financial Controls.
- **Assessment scenarios:** CFO-A01 (P&L analysis), CFO-A02 (budget variance), CFO-A03 (unit economics), HOD-A01.
- **Build stage:** Stage 3 — alongside brand CEOs (they need finance data).
- **Do-not-touch:** Never approves spend. Never makes payments. Bank details and PAN live only in `invoice_settings`, never in code or chat.
- **Tests:** `CFO-A01..A03`, `HOD-A01` scenarios.

---

### DS-14 Care (Customer Care)

- **Purpose:** Customer care, WhatsApp inboxes and FAQ.
- **Owns:** WhatsApp inbox monitoring, customer issue triage, FAQ management, response drafting (in brand voice), CSAT tracking.
- **Escalates:** Brand CEO for brand-specific product issues; Virat for any customer-facing reply (Virat sends, Care drafts).
- **Reads:** WhatsApp inboxes (per brand), customer order data, FAQ database, brand voice modules.
- **Writes:** Response drafts, triage records, FAQ updates, CSAT reports.
- **Reports to:** DS-02 Dev.
- **Daily status format:** `{ member_id: "DS-14", status, summary: "inbox count, response time, open issues, CSAT" }`.
- **KPIs:** Resolution quality, response time, CSAT, FAQ coverage.
- **Where it runs:** OPEN QUESTION for Virat to answer through GPT. Needs WhatsApp Business API integration per brand.
- **Training modules:** HOD-01 Functional Leadership, CCO-01 Customer Operations.
- **Assessment scenarios:** CCO-A01 (triage WhatsApp messages), HOD-A01.
- **Build stage:** Stage 4 — after brand CEOs have WhatsApp connected.
- **Do-not-touch:** Never sends replies to customers directly. Drafts only; Virat (or brand CEO with Virat's approval) sends.
- **Tests:** `CCO-A01`, `HOD-A01` scenarios.

---

### DS-15 Crew (Team Ops)

- **Purpose:** Team operations and ops checklists. Manages Prince's task tracking.
- **Owns:** Prince's checklist (`retail_os_ops_tasks`), workforce readiness, SLA monitoring, task completion tracking.
- **Escalates:** Dev for workforce decisions; Virat for assigning Prince work.
- **Reads:** `retail_os_ops_tasks` table, work items assigned to P-01, SLA data.
- **Writes:** Task records for Prince, performance reports, SLA breach alerts.
- **Reports to:** DS-02 Dev.
- **Daily status format:** `{ member_id: "DS-15", status, summary: "Prince tasks complete/total, SLA breaches, blockers" }`.
- **KPIs:** Task completion rate, SLA adherence, workforce readiness, onboarding speed.
- **Where it runs:** OPEN QUESTION for Virat to answer through GPT.
- **Training modules:** HOD-01 Functional Leadership, CHRO-01 People Operations.
- **Assessment scenarios:** CHRO-A01 (worker performance review), HOD-A01.
- **Build stage:** Stage 2 — People OS is partially built (people.ts, people-action.ts).
- **Do-not-touch:** Never assigns work to Prince. Drafts recommendations; Virat assigns. Never contacts Prince directly (tech@ only, cc founder@).
- **Tests:** `CHRO-A01`, `HOD-A01` scenarios; `tests/unit/ceo-integration/people.test.ts`.

---

### DS-16 Guard (Visual QA & Brand Guardian)

- **Purpose:** Visual QA, brand-book compliance, design review and platform compliance.
- **Owns:** Brand store audits (visual), brand-book deviation detection, platform compliance checks, design review before publish.
- **Escalates:** DS-11 Grow (reports to Grow), then Dev for systemic visual issues.
- **Reads:** Brand-book modules (`lib/brand-voice.ts` per brand), live store pages, social content, ad creatives.
- **Writes:** Audit reports with brand-book references, severity classifications, required fixes.
- **Reports to:** DS-11 Grow.
- **Daily status format:** `{ member_id: "DS-16", status, summary: "audits run, deviations found, brands checked" }`.
- **KPIs:** Brand-book compliance rate, visual consistency, platform compliance, review turnaround.
- **Where it runs:** OPEN QUESTION for Virat to answer through GPT. Needs multimodal (image analysis) capability.
- **Training modules:** SP-01 Specialist Competence.
- **Assessment scenarios:** GRD-A01 (audit store page against brand book).
- **Build stage:** Stage 4 — after brand CEOs and Grow. Requires brand-book modules to exist per brand.
- **Do-not-touch:** Does not fix issues itself. Reports deviations with references; the brand CEO or Grow fixes.
- **Tests:** `GRD-A01` scenario.

---

### DS-17 Improve (Process Efficiency)

- **Purpose:** Continuous improvement detection, root cause analysis, change control, prevention, standardisation.
- **Owns:** Improvement pipeline (detected → analysed → root_caused → proposed → approved → implementing → verifying → standardised → closed), recurrence analysis, PTM classification, process mapping.
- **Escalates:** Dev for proposed process changes; Virat for anything irreversible.
- **Reads:** Work Registry (all items, looking for patterns), incident history, LEARNINGS.md, improvement records (`src/lib/improvement/`).
- **Writes:** Improvement proposals, root cause analyses, process standards, learnings (appends to LEARNINGS.md).
- **Reports to:** DS-02 Dev.
- **Daily status format:** `{ member_id: "DS-17", status, summary: "improvements detected, patterns found, standards proposed" }`.
- **KPIs:** Improvement detection rate, recurrence reduction, root cause resolution, process standardisation.
- **Where it runs:** Likely within the master control session; operates on the Work Registry which lives in this repo.
- **Training modules:** SP-01 Specialist Competence, IMP-01 Process Improvement.
- **Assessment scenarios:** IMP-A01 (detect recurring pattern, propose change), IMP-A02 (audit process for inefficiency).
- **Build stage:** Stage 3 — after Dev is operational and Work Registry has enough data.
- **Do-not-touch:** Does not implement changes. Proposes standards; Dev approves and implements (or delegates). Never makes irreversible process changes without approval.
- **Tests:** `IMP-A01`, `IMP-A02` scenarios; `src/lib/improvement/` type and detection tests.

---

### P-01 Prince Keshri (Human)

- **Purpose:** Internal tech-stack connecting: accounts, integrations, keys (by invitation), webhooks, templates, DNS, deploys, setup records.
- **Owns:** Technical deployment tasks assigned by Virat.
- **Escalates:** Virat (reports to Virat directly, not through Dev).
- **Reads:** His work page, task checklist, tech@ email.
- **Writes:** Setup records, integration completions, deployment confirmations.
- **Reports to:** DS-00 Virat (tasks only via Virat).
- **Daily status format:** Not an agent — tracked via `retail_os_ops_tasks` (Supabase project `vszjwgxvqoqyixpfthwl`, member id `7ccc4990-12b8-424b-93cf-724645fbac69`).
- **Where it runs:** Human. Work page: `viratmohan.com/retail-os/ops/18192551-2bcc-4140-bb2b-6a44abb9c744`.
- **Do-not-touch:** Never assigned work without Virat saying so. Not marketing, ads, content, catalogue, data entry, commercial terms, or client contact. Email to tech@viratmohan.com (cc founder@), never personal Gmail for work.
- **Tests:** `tests/unit/ceo-integration/people.test.ts`, `tests/unit/ceo-integration/runtime-activation.test.ts` (People OS worker actions).

---

## Build order

| Stage | Agents | Prerequisite |
|-------|--------|-------------|
| 1 | DS-02 Dev (CEO) | Work Registry, Brain, certification system — all in this repo |
| 2 | DS-01 Myoho, DS-10 Check, DS-15 Crew | Dev operational; health script running; People OS built |
| 3 | MG-01 Moon, TC-01 Trav, CK-01 Cera, DS-13 Books, DS-17 Improve | Dev + brand repos ready; finance data accessible |
| 4 | FP-01 Paws, KB-01 Kor, DS-11 Grow, DS-12 Deal, DS-14 Care, DS-16 Guard | Brands go-live; growth machine running; WhatsApp connected |

Within each stage, agents can be built in parallel.

## Certification lifecycle

```
TRAINING_REQUIRED → TRAINING → ASSESSMENT → CERTIFIED_L1 → CERTIFIED_L2 → AUTONOMOUS_L3
```

- **CERTIFIED_L1:** At least half of training modules have a passed assessment. Agent can execute bounded tasks under supervision.
- **CERTIFIED_L2:** All training modules covered by at least one passed assessment. Agent operates within its grants.
- **AUTONOMOUS_L3:** All modules covered + at least 2× scenarios passed per module. Full autonomy within capability grants.
- Certification does not override the L0–L4 autonomy model. An L4 action (spend, pricing, outbound comms, terms, irreversible) always requires Virat regardless of certification level.

## Open questions for Virat to answer through GPT

1. **Where does each agent run?** Dedicated Claude Project per agent, or sessions spawned from master control, or a mix? Brand CEOs likely need their own projects (they have their own repos). Function heads could run within master control.
2. **Guard (DS-16) needs multimodal.** Which model and how? Screenshot-based audits via Playwright, or API-based image analysis?
3. **Care (DS-14) needs WhatsApp Business API.** Per-brand embedded signup is the plan — timeline?
4. **Agent-to-agent communication.** Currently via the Work Registry (work items, status updates). Is that sufficient, or do agents need direct messaging?
5. **Automatic vs manual certification.** Should assessments be run automatically (e.g. a scheduled routine that tests each agent), or manually triggered by Dev/Virat?
6. **Board seats (BD-01..03).** Any timeline or criteria for filling these?

## Do-not-touch rules (global)

1. No agent approves spend, pricing, outbound comms, terms/legal or irreversible actions. These are L4 → Virat.
2. No agent assigns work to Prince without Virat's explicit approval.
3. No agent contacts customers, brand founders or clients directly. Virat sends; agents draft.
4. No agent deploys to production. Prince deploys; Dev/Check verifies.
5. `brain.high_stakes = Opus 5.5` — do not change model governance.
6. No agent creates cross-brand superuser shortcuts.
7. COD stays off across Retail OS unless Virat says otherwise.
8. Every number must be traceable to a source. No invented metrics.
9. LEARNINGS.md is append-only. Every fix ends with one lesson.
