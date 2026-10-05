# DevShop / Retail OS — canonical estate

**One source of truth for what exists in the estate: every repository, project, brand and package, which group it belongs to, and what it is called now vs. what it should be called.** Read this before creating any new repository, project or package. If something here is wrong or missing, fix it here first.

- **As of:** 2026-10-05
- **Owner:** Virat (master control: the viratmohan.com Claude Code session).
- **Scope:** the `virat-mohan` GitHub org + the brand/client records that have no repository yet.

---

## 1. How to use this (the estate guard)

Before you create a repository, Supabase project, package or "module", do this in order:

1. **Find the group** in §4 that the thing belongs to.
2. **Check it does not already exist** under that group (repo list in §5, brand records in §6).
3. If a home already exists, **extend or configure it** — do not fork a new one.
4. If nothing fits, it is genuinely new: **classify it** (which of the five capability classes in `CLAUDE.md` → "Retail OS product architecture"), **name it** by the standard in §7, and **add a row here in the same change.**

The sequence is always **standardise → template → configure → measure → improve**. Never: client request → bespoke build → new fork → repeat. A new repo that is not in this document is, by definition, off-standard.

---

## 2. Vocabulary (used exactly, everywhere)

These are different things. Keep them distinct in copy, code and planning.

- **PRODUCT** — a thing DevShop sells/operates as a standard. There is one core product: **Retail OS**. "DevShop" is the company/brand that makes it; "Custom Build" is bespoke work outside Retail OS.
- **BRAND** — a commercial identity we run Retail OS for (a client brand, e.g. Travaholic, Moon, Fresh For Paws), or our own (DevShop). A brand is not a repo and not a project; it may map to one, many, or none.
- **PROJECT** — a deployable application instance (an app + its environment/DB). Today each live brand is its own app + its own Supabase project (the current environment model; no multi-tenancy decision has been made).
- **MODULE** — a capability inside Retail OS (e.g. Inventory Master, Commerce, CRM / Leads). Core, optional-reusable, or client-specific. A module is code/feature, not a repo.
- **PACKAGE** — a versioned, shared library consumed by projects (e.g. `@retail-os/brand-config`). Shared code lives in a package, built once, consumed everywhere.
- **REPOSITORY** — a Git repo. It may hold a project, a package, the control plane, or legacy code. Repo name ≠ brand name ≠ project name.

---

## 3. Canonical groups

1. **DEVSHOP CORE** — the company's own surfaces and shared tooling that are not a single brand's store.
2. **RETAIL OS — CONTROL PLANE** — the master-control app and standards (`ViratMohan` / viratmohan.com).
3. **RETAIL OS — SHARED PACKAGES** — versioned libraries consumed by brand projects (`retail-os-brand-config`).
4. **RETAIL OS — LIVE BRANDS / ACTIVE CLIENTS** — brands we run Retail OS for in production, including paid active clients still in build.
5. **CLIENT-SPECIFIC EXTENSIONS** — code built for exactly one client, never forced into core (e.g. Ceremony Finance, Ceremony Ops).
6. **REUSABLE IP / EXPERIMENTS** — prototypes and reusable ideas not yet productised.
7. **LEGACY / ARCHIVE CANDIDATES** — superseded or dormant repos kept for history; archive only when Virat says so.

---

## 4. Group → what belongs there (decisions)

- **Control plane is `ViratMohan` (Astro).** It holds standards, brand books, routines and master control. Astro is the control-plane framework; it is not the preferred framework for new brand stores.
- **New brand stores default to Next.js** (the brand plane). KORBI stays on Astro but Astro is not preferred for new stores.
- **Shared structured brand data has exactly one home: `@retail-os/brand-config`.** Do not create a second structured Brand Foundation / Brand Memory schema anywhere. In-repo `brand-voice.ts` / `retail-os-brand.ts` files are **consumers/adapters**, not rival authorities.
- **Ceremony Finance and Ceremony Ops are client-specific extensions** of Ceremony Kitchen (`ceremony-os`), not core Retail OS modules.
- **A brand with no repo is still part of the estate** — it lives in §6 until (and if) a project is built.

---

## 5. The canonical estate table (repositories)

All 12 repos under `virat-mohan` (GitHub `list_repos`, 2026-10-05). Frameworks/status from prior read-only estate scans + each repo's own files; **do not rename any production repo now** — the "Rename later?" column records intent only.

| Repository | Current name | Group | Brand / Product | Purpose | Framework | Status | Target name | Rename later? |
|---|---|---|---|---|---|---|---|---|
| ViratMohan | `ViratMohan` | Control plane | DevShop / viratmohan.com | Master control, standards, brand books, routines | Astro + Supabase (`vszjwgxvqoqyixpfthwl`) | Active production (public) | `devshop-control-plane` | Later, low priority — many links point at it; do not rename now |
| retail-os-brand-config | `retail-os-brand-config` | Shared packages | Retail OS (`@retail-os/brand-config`) | Versioned brand identity + Foundation + Memory contract | TypeScript package (ships `dist`) | Active (private) | — (already canonical) | No |
| moon-glasses | `moon-glasses` | Live brands | Moon / Moonglasses | Live store | Next.js 16 + Supabase | Active production (public) | `retail-os-moon` | Later — live store; rename only in a planned window |
| Travaholic_caps | `Travaholic_caps` | Live brands | Travaholic | Live store | Next.js 16 + Supabase | Active production (public) | `retail-os-travaholic` | Later — live store; rename only in a planned window |
| korbi | `korbi` | Live brands | KORBI (Ankay Holdings) | Live store | Astro (not preferred for new stores) | Active production (private) | `retail-os-korbi` | Later — live store; Astro stays for now |
| ceremony-os | `ceremony-os` | Client-specific extensions | Ceremony Kitchen (Ceremony Finance + Ceremony Ops) | Ops/finance backend behind viratmohan.com/devshop/ceremonykitchen | Next.js | Active production (private) | `retail-os-ext-ceremony` | Later — client-specific; keep name clear it is not core |
| indiacontemporary.net | `indiacontemporary.net` | Live brands (verify) | India Contemporary | Art marketplace, "built on Retail OS" | Vite + React + Supabase | Public; production status to confirm with Virat | `retail-os-indiacontemporary` | Later — confirm live/active first |
| thefeelingco | `thefeelingco` | Live brands (verify) | The Feeling Co by Radhika | Events/decor site, "built on Retail OS" | Static HTML + React | Private; production status to confirm with Virat | `retail-os-thefeelingco` | Later — confirm live/active first |
| Content-ment | `Content-ment` | Reusable IP / experiments | — (content/marketing-ops SaaS) | Content/marketing-ops dashboard prototype | Next.js + Prisma + Radix | Experiment / reusable IP (public) | `devshop-content-ops` (if productised) | Only if productised |
| Travaholic | `Travaholic` | Legacy / archive candidate | Travaholic (original) | Predecessor "emergent" app to Travaholic_caps | Python + React | Superseded (public) | — | Archive candidate — **only on Virat's say-so** |
| Coachyourpsyche | `Coachyourpsyche` | Legacy / archive candidate | Coach Your Psyche | Emergent coaching app | (emergent app) | Dormant (private) | — | Archive candidate — **only on Virat's say-so** |
| Mystique | `Mystique` | Legacy / archive candidate | Mystique | Emergent ecommerce app | (emergent app) | Dormant (private) | — | Archive candidate — **only on Virat's say-so** |

**Note on production status:** `indiacontemporary.net` and `thefeelingco` say "built on Retail OS" but I have not confirmed with Virat that they are live, paying or active. Marked *verify*, not assumed active. A domain existing is not proof of an active engagement.

---

## 6. Brands / clients with no dedicated repository

A brand record (Supabase row, brand book, domain) is **not** proof of a technical implementation. These belong in the estate but have no repo today.

| Brand / client | Status | Repo | Framework / deployment | Database | Relationship to Retail OS | Source |
|---|---|---|---|---|---|---|
| **Fresh For Paws** (`freshforpaws.com`) | **RETAIL OS — LIVE / ACTIVE CLIENT** (paid). NCNDA 27 Sep 2026, deposit 30 Sep, build clock started 30 Sep, target 7 Oct 2026. Founder Srishti Bhatia. | **ACTIVE CLIENT — NO DEDICATED REPOSITORY IDENTIFIED** | WooCommerce storefront stays live; Retail OS runs behind it. No dedicated Next.js/Astro repo found in the 12-repo estate. | Supabase control-plane `brands` row `freshforpaws` + `retail_os_applications` 8ad86490 (viratmohan.com project). No dedicated brand DB/project identified. | Active paid client; Retail OS operates behind the existing WooCommerce front. | `case-study/brands/freshforpaws.md`; GitHub `list_repos` 2026-10-05 (no match); grep of this repo. |
| Fresh For Purrs / Mini Paws | Sub-lines of Fresh For Paws | (same as above) | (same) | (same) | Part of the Fresh For Paws engagement | `case-study/brands/freshforpaws.md` |
| Aloo Chips | Brand book only; status to confirm | None identified | — | — | Brand record; no implementation confirmed | `case-study/brands/aloochips.md` |
| Radico Khaitan | Brand book only; status to confirm | None identified | — | — | Brand record; no implementation confirmed | `case-study/brands/radico-khaitan.md` |
| The Party Collective | Brand book only; status to confirm | None identified | — | — | Brand record; no implementation confirmed | `case-study/brands/the-party-collective.md` |
| Blak Sand | Brand book only; status to confirm | None identified | — | — | Brand record; no implementation confirmed | `case-study/brands/blak-sand.md` |
| Layover Studio | Brand book only; status to confirm | None identified | — | — | Brand record; no implementation confirmed | `case-study/brands/layover-studio.md` |

> Do **not** create a repository automatically for any of the above. A repo is created only when the work needs one and Virat approves it.

---

## 7. Naming standard

Applies to **new** repos/packages/modules. Existing production repos are **not** renamed now (see the table's "Rename later?" column).

- **Brand store project repo:** `retail-os-<brand>` — e.g. `retail-os-moon`, `retail-os-travaholic`, `retail-os-korbi`.
- **Shared Retail OS package:** `@retail-os/<capability>` (npm scope) in repo `retail-os-<capability>` — e.g. `@retail-os/brand-config`.
- **DevShop-level shared tool/capability (not one brand):** `devshop-<capability>` — e.g. `devshop-control-plane`, `devshop-content-ops`.
- **Client-specific extension:** `retail-os-ext-<client>` — e.g. `retail-os-ext-ceremony`.
- **Module names inside Retail OS** are canonical and fixed (see `CLAUDE.md`): Brand Dashboard / Command Centre, Commerce, Orders, Products, **Inventory Master** (never renamed), Customers, Marketing, Acquisition / MoF / CRO, CRM / Leads, Growth Intelligence, Finance / Unit Economics, Operations, Reporting, AI / Brain, Tasks / Approvals, Integrations, optional Creator / Influencer, optional Experimentation.

---

## 8. Shared-lineage findings

- **Travaholic_caps and moon-glasses share a lineage.** Both are Next.js 16 Retail OS brand stores with the same shape: `lib/retail-os-brand.ts` (identity), `lib/brand.ts` (profile re-export), `lib/brand-voice.ts` (voice/checkVoice), `proxy.ts` gating `/admin` + `/api/admin/*`. Moon came slightly earlier; caps is the current reference implementation for the admin standard and the Brand Foundation consumer pattern. Treat improvements proven on one as candidates to port to the other and to templatise — not to re-invent per brand.
- **One brand-config authority, consumed by both.** Both stores consume `@retail-os/brand-config` (pinned by commit SHA). Neither holds a second structured schema.

---

## 9. Not part of the current architecture

- **Opportunities Unlocked LLP** is **not** a current business, product or project in this architecture. Do not represent it as one in any estate map, copy or plan. If it becomes relevant, Virat decides and it is added here first.

---

## 10. Sources

- GitHub `list_repos` for `virat-mohan` (2026-10-05) — the 12 repos in §5.
- Prior read-only estate scans (Stage 0 rebaseline + Stage 7/8/9) — frameworks, deployment and status per repo.
- `case-study/brands/*.md` — brand books (Fresh For Paws and the brand-only records in §6).
- `CLAUDE.md` — product architecture, capability classes, canonical module names, control/brand/shared-package decisions.
- Virat (2026-10-05) — Fresh For Paws is a paid active client and must be in the estate.

Anything not confirmed above is marked *verify* / *to confirm*, not asserted.
