# DevShop / Retail OS — Brand & Output Standard

**Version 1.0 · 2026-09-28 · Owner: Virat Mohan (founder@viratmohan.com)**

This is the ONE canonical brand and output standard for all DevShop / Retail OS work.
Every DevShop/Retail OS Claude chat, agent, or Cowork workflow reads this file (and the
files it points to) **before** creating any branded output. Do not invent a competing
colour set, font, layout, email style, proposal structure, report definition, or
terminology. If something you need is not defined here, mark it `UNKNOWN` and ask —
do not make it up.

The canonical *visual* source of truth is the **viratmohan.com website**:
`src/styles/global.css` (authoritative) mirrored to `public/brand/tokens.css`
(https://viratmohan.com/brand/tokens.css), drift-checked by
`node scripts/check-brand-tokens.mjs`. This document does not redefine those tokens;
it references them and adds the output rules around them.

---

## 1. Brand architecture

```
viratmohan.com  (founder / umbrella site — light "paper" editorial)
     └── DevShop            (operating/product brand — dark editorial)
            └── Retail OS    (the product every brand runs on)
                   └── Client brands (Travaholic, Moon-glasses, Ceremony Kitchen, …)
```

A client brand keeps its own identity. The Retail OS experience underneath it must
stay recognisably one product family. Same system, many brands — never "three
different agencies."

## 2. Two surface modes (both real, both in the codebase — do not invent a third)

Both modes share the same gold accent (`#d4af37`) and the same type system.

**Light "paper" editorial** — viratmohan.com site, Retail OS customer/lead pages,
emails, most documents. Tokens in `public/brand/tokens.css`:
- `--paper #f4ead4` (background) · `--ink #1a1410` (text) · `--gold #d4af37` (accent)
- `--dim #5a4c3c` · `--sage #a8b5a0` · poster accents `--terracotta #d9714b`,
  `--cobalt #3e6fa6`, `--magenta #e91e8c`, `--bronze #9c7a4a`
- faint halftone dot ground; zero rounded-SaaS look; a 4-swatch colour band.

**Dark editorial** — DevShop portal + `/devshop/admin` surfaces. Source of truth:
`src/components/devshop/PortalHeader.astro`:
- `#15130f` (background) · `#d4af37` (primary accent) · `#91afc0` (secondary accent,
  steel blue) · `#f5f5f0` (primary text) · `#a66a62` (muted terracotta) · `#b7b5af` (dim nav)

Use light paper by default. Use dark editorial for DevShop portal/admin/product
surfaces and DevShop-primary decks/one-pagers where the dark look is intended.

## 3. Typography (both modes)

- **Display:** `Anton`, uppercase, tight leading — h1/h2 (`--display`).
- **Serif lede/quote:** `Instrument Serif`, italic — ledes, pull quotes, signature (`--serif`).
- **Body/UI:** `Inter` (`--sans`).

Load fonts from `tokens.css` (self-hosted/Google as there). Do not swap in new fonts.
Standalone pages/apps: `<link rel="stylesheet" href="https://viratmohan.com/brand/tokens.css">`
and use the `.vm-*` utility classes (`.vm-page`, `.vm-card`, `.vm-band`, `.vm-display`,
`.vm-kicker`, `.vm-serif-lede`, `.vm-mission`, `.vm-signature`).

## 4. Visual do-not list

No glowing AI brains, futuristic/stock-AI imagery, heavy gradients, sterile SaaS
dashboards, decorative clutter, or rounded-everything. Premium, editorial, restrained,
highly legible. Plenty of white space, one idea per screen, gentle motion only, works
at phone width with no sideways scroll.

## 5. Client vs DevShop branding (which layer leads)

- **Client-brand primary:** customer marketing, campaign creative, a brand's content
  calendar, brand performance comms → the client's own identity leads.
- **DevShop/Retail OS primary:** proposals, implementation plans, onboarding docs,
  methodology, system/product docs, most client performance reports → the DevShop
  system leads; add the client's identity where useful.
- **Dual-brand:** materials explaining the service to a client → client brand +
  "Powered/operated by DevShop · Retail OS" where appropriate.

## 6. Voice (from CLAUDE.md `/mission`, unchanged)

First person "I", never "we". Plain language. Every ask explains why. Every task has a
SMART goal and reports target vs actual. Reports to Virat end with live links to what
changed. The CTA is **"Let's talk."** (WhatsApp). Never invent numbers; sample data is
labelled as sample. Customer-facing brand stores keep their own brand voice.

## 7. Terminology (canonical — do not rename)

- **Inventory Master** (canonical). The stores' single stock count is the "Stock view"
  of it; moon-glasses' `master-inventory` page is the Catalogue/Products manager
  (legacy label). The reference model lives in `ceremony-os` (`inv_*`).
- Product boundary, in order: **Core Retail OS → Optional reusable modules → Brand
  configuration → Client-specific extensions → DevShop Custom Build.**
- **Ceremony Finance** and **Ceremony Ops** are Ceremony Kitchen-specific extensions,
  never core. Ceremony Kitchen itself is a Retail OS client/brand.

## 8. Reporting metric definitions (canonical — do not redefine per chat)

From `src/lib/retail-os-portfolio.ts`, mirroring each store's own `lib/pnl.ts`:
- **netSales** = grossSales − discounts − refunds (non-cancelled orders)
- **cogs** = units sold × COGS per unit (per-brand setting; the `250` fallback is a
  PROVISIONAL management figure, never a production/customer number)
- **expenses** = manual expenses + Meta ad spend + WhatsApp message cost + Pay-With-A-Post value
- **netProfit** = netSales − cogs − expenses
- **ROAS** = sales attributed to ads ÷ ad spend
- A **deposit is never revenue.** Founder hours are never monetised.

If a metric (CAC, AOV, contribution, conversion) is not defined above or in code,
mark it `UNKNOWN` — do not invent a definition. No invented pricing: pricing is
**ON REQUEST / AS AGREED** unless approved commercial data exists.

## 9. Recurring outputs — canonical templates & where they live

Inherit the common system; do not redesign per chat. Status is honest:

| Output | Canonical source | Status |
|---|---|---|
| Content & performance calendar | `tools/calendar/render.mjs` + `tools/calendar/README.md` (Ceremony Kitchen Diwali 2026 format) | **CANONICAL** |
| Transactional/lead emails | `src/lib/retail-os-email.ts`, `src/lib/lead-mail/*`, `src/lib/calm-page.ts` (paper look, gold rule) | **CANONICAL (code)** |
| Brand P&L / weekly report | `src/lib/retail-os-reports.ts` + §8 definitions | **CANONICAL (code)** |
| Proposal / one-pager / deck / onboarding doc | — | **NOT YET CANONICAL** — use §2–§8 + the §10 proposal skeleton; do not fork a new look |
| WhatsApp templates | per-brand approved templates in each store's `app_settings` | brand-configured |

Prior one-off proposals/overviews generated in individual chats are **useful but
inconsistent** — reuse their content, not their bespoke styling.

## 10. Proposal skeleton (structure only; no hardcoded pricing)

Context · Problem · Opportunity · Proposed solution · Scope · Deliverables ·
Methodology (transparent about human involvement + recurring support) · Responsibilities ·
Implementation · Commercial framework (ON REQUEST / AS AGREED) · Assumptions ·
Exclusions · Next steps ("Let's talk.").

## 11. How a new chat / agent consumes this standard

```
New chat/agent → read CLAUDE.md → read this file (BRAND_OUTPUT_STANDARD.md)
  → load brand/tokens.css + the relevant client brand config
  → do the task → apply the canonical template → validate against §12 → return output
```

Do not rely on Virat re-explaining the brand each time. This file is referenced from
`CLAUDE.md` so it is in context for DevShop/Retail OS work in this repo. The store
repos and future agents should point at this same file (see §14).

## 12. Quality-control checklist (run before returning any branded output)

- **Brand:** correct palette for the surface (§2), Anton/Instrument Serif/Inter,
  no visual clutter, phone-width safe.
- **Product:** correct Retail OS terminology (§7), correct client/product boundary (§5).
- **Commercial:** no invented pricing/claims/metrics/promises (§8).
- **Content:** right client-vs-DevShop layer, consistent terminology, correct voice (§6).
- **UX:** clean hierarchy, responsive, accessible.

## 13. Version control

Change this file, bump the version + date, add a line to §15. Never patch dozens of
chats by hand — future agents consume the current version here.

## 14. Future master control (not built now)

Eventually: Founder → Master instruction → CEO agent → HOD/agent → execution, with a
capability/agent registry that knows each output's type, canonical template, brand
standard, owner, version and approved variants. For now this file is that reference.
Next incremental step to widen reach: add a one-line pointer to this file in each store
repo's `CLAUDE.md` ("Brand/output standard: viratmohan repo `case-study/BRAND_OUTPUT_STANDARD.md`").

## 15. Change history

- **1.0 · 2026-09-28** — First canonical brand & output standard. Consolidates the
  existing viratmohan.com token system (`global.css`/`tokens.css`), the DevShop dark
  surface (`PortalHeader.astro`), voice/terminology from `CLAUDE.md`, and metric
  definitions from `retail-os-portfolio.ts`. No visual system invented; no tokens changed.
