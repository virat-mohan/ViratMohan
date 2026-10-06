# Retail OS brand dashboard: one standard for every brand

Every brand's admin looks and works the same: same structure, same sections, same names, same navigation philosophy, same interaction patterns, same look. A founder who knows one Retail OS dashboard knows them all. Common structure does not mean identical content — enabled modules, products, customers, orders, inventory, integrations, brand content, finance data, campaigns, permissions and client-specific extensions all differ by brand. The underlying dashboard architecture is consistent.

Classification: **core Retail OS**. Reference implementation: Travaholic Caps.

## Canonical navigation structure (exact names, exact order)

| Section | Purpose |
|---|---|
| **Command Centre** | Brand operating overview: business health, key KPIs, revenue, orders, customers, retention, inventory exceptions, finance exceptions, growth performance, operational issues, important work, approvals, alerts, opportunities |
| **Brand / Brand Foundation** | Brand profile, identity, brand book, story, positioning |
| **Catalogue** | Products, collections, categories, content |
| **Commerce** | Orders, checkout, payments, shipping, returns, discounts |
| **Growth** | Marketing, ads, content calendar, social, email, WhatsApp campaigns, creators, SEO, channels, acquisition, funnel |
| **Inventory Master** | Stock, warehouse, suppliers, purchase orders, reorder (canonical name — never rename) |
| **Finance** | P&L, expenses, statements, settlements, business plan |
| **Operations** | Tasks, approvals, integrations, operational workflow |
| **Team & Partners** | Team members, access, roles, partners, collaborators |
| **Reports** | Reporting, analytics, exports |
| **Settings** | Configuration, preferences, technical settings |

Additional capability surfaces may exist where relevant, but they fit into this structure rather than creating a different dashboard architecture per brand.

## Module states

Every module/capability has one of these states, visible to the founder:

| State | Meaning |
|---|---|
| **Live** | Active and operational |
| **Available** | Ready to enable |
| **Setup required** | Needs configuration before use |
| **Commercial** | Commercially gated (requires plan/agreement) |
| **Client-specific** | One brand only; not core Retail OS |
| **Coming soon** | Not yet available |

The founder can understand what is live, what is available, what needs setup, what is commercially gated, what is client-specific, and what is not yet available — without learning a new navigation system for every brand.

## Rules

- A page that a brand doesn't use yet is hidden, not renamed. Old paths redirect to the standard ones so no link breaks.
- The same word means the same thing everywhere: "Orders" not "Sales", "Inventory Master" (canonical, never renamed), "Command Centre", "Cost per order".
- Every list page: filter bar (period: today, this week, last week, month to date, last month, custom; compare: period before, last month, last year), then summary tiles, then the table. Every number shows its source.

## Look

viratmohan.com tokens (`/brand/tokens.css`): paper background, ink text, gold and terracotta accents, serif headings, sans body; DevShop Retail OS mark top left, brand name beside it; left sidebar on desktop, bottom sheet menu on phones; no sideways scroll at 390px; calm, one idea per screen. The brand's own colours appear only in its logo and its storefront, never in the admin chrome.

## Shared modules every brand gets

- **WhatsApp inbox**: the brand connects its own WhatsApp Business number with Meta's Embedded Signup in coexistence mode, so the number keeps working in the phone app and every message also lands here. Replies from the dashboard or the phone show in both. A bot answers routine questions later from the brand's Brain and product data, handing anything else to a person in the same thread.
- **Where orders came from** (Growth → Channels): orders by channel, overall and ads cost per order (see GROWTH-MACHINE.md).
- **Integrations**: one page showing every connection (payments, shipping, Meta, WhatsApp, Instagram, email, Google) as connected, needs attention, or not set up, with the exact fix.

## Command Centre: the operating overview

The Command Centre is the brand's operating overview. It surfaces the most important business information and decisions — not another generic analytics dashboard. The information architecture above lists what it is capable of showing as relevant. Do not implement all of it just because it is listed; it establishes the canonical shape.

## Responsive / consistent experience

The shell, navigation hierarchy, terminology and major interaction patterns are consistent across Retail OS brands. A founder moving from Travaholic → Moon → Ceremony → Korbi → Fresh For Paws should not have to learn an entirely different operating system each time.

## Implementation authority

- **Canonical dashboard/navigation contract**: `@retail-os/brand-config` (`dashboard-sections.ts`). The 11 sections, 6 module states, nav-group-to-section mapping, and `buildDashboardSections()` live in the shared package. One authority, one source.
- **Brand-plane implementation**: Next.js. The starter is `starters/next-brand-plane/` in virat-mohan/ViratMohan. A new brand clones the starter, supplies its `BrandConfig`, and gets the canonical dashboard shell.
- **Control-plane implementation**: Astro. The Founder Control Tower at `/retail-os/admin/console.astro` is the cross-brand operating view. It is separate from the brand dashboard.
- **Control-plane dashboard types** (`src/lib/retail-os-dashboard/`): control-plane-specific view models for the Astro Founder Console. Not the brand-plane authority.
- **Work Registry boundary**: the brand dashboard may display Work Registry information through a controlled read adapter/API. Brand applications do not access the central Work Registry database directly.

## How a new brand consumes the dashboard

1. Clone `starters/next-brand-plane/`.
2. Supply `BrandConfig` in `lib/brand-config.ts` (identity, tokens, commerce, integrations, module overrides, extensions).
3. The dashboard shell resolves the 11-section navigation from the config via `@retail-os/brand-config`.
4. Sections with no enabled modules are hidden unless they have brand-specific links. Module states are derived from `resolveModuleStatus()`.
5. Client-specific extensions are declared in the brand's own config, not in the shared registry.
6. Brand-specific route links are declared in `lib/dashboard-nav.ts`, mapped to canonical sections.

## Reference implementations

### Travaholic Caps (first)

Travaholic is the first live brand consuming the canonical dashboard contract:
- **Package pin**: `@retail-os/brand-config` at commit `955bacb` (main)
- **BrandConfig**: `lib/brand-config.ts` — 14 optional modules enabled, 1 client extension (explorer-submissions)
- **Nav adapter**: `lib/dashboard-nav.ts` — derives sections from `buildDashboardSections()`, maps 31 brand-specific route links
- **Local nav authority removed**: `components/admin/shell/nav.ts` is a thin re-export from the adapter
- **Capability preservation**: 34 admin pages, 70+ API endpoints, 12 cron jobs, 5 webhooks — all preserved (see `case-study/TRAVAHOLIC-CAPABILITY-MATRIX.md`)
- **Branch**: `canonical-dashboard-shell` on `virat-mohan/Travaholic_caps`

### Moon (second)

Moon is the second live brand consuming the canonical dashboard contract:
- **Package pin**: `@retail-os/brand-config` at commit `955bacb` (main)
- **BrandConfig**: `lib/brand-config.ts` — 17 optional modules enabled, 8 client extensions (models, product-images, tagged-posts, payment-confirmations, social-instagram, master-inventory, team-access, explorer-submissions)
- **Nav adapter**: `lib/dashboard-nav.ts` — derives sections from `buildDashboardSections()`, maps 38 brand-specific route links
- **Local nav authority removed**: `components/admin/shell/nav.ts` is a thin re-export with backward-compatible type aliases (AdminNavLink→NavLink, AdminTone→Accent, AdminNavSection→NavSection, findNav preserved alongside findCurrent)
- **Capability preservation**: 38 admin pages, 80+ API endpoints, 12 cron jobs, 6 webhooks — all preserved
- **Branch**: `canonical-dashboard-shell` on `virat-mohan/moon-glasses`

## Brand Dashboard vs Founder Control Tower

- **Brand Dashboard**: operates one brand (this standard).
- **Founder Control Tower**: operates DevShop / all brands / agents / work / decisions.

These are distinct. Do not merge them into one giant interface.

## Dashboard UX (implemented)

### Breadcrumbs

Every Retail OS dashboard (Founder Control Tower and every Brand Dashboard) has a consistent breadcrumb system showing the user's location in the application hierarchy. Breadcrumbs are derived from the real route/page context, not hardcoded.

**Founder Control Tower** (`control-tower.astro`): `Command Centre › Control Tower › [tab]`. The default Morning Board tab shows `Command Centre › Control Tower`; deeper tabs append the tab name.

**Brand Dashboards** (`starters/next-brand-plane/components/Breadcrumbs.tsx`): `Brand Name › Section › Page`. Derives crumbs from `usePathname()` + the `DashboardSectionView[]` sections. Integrated into `DashboardShell.tsx` so every brand gets it automatically.

### Mobile-first usability

All dashboards are genuinely usable on mobile as a first-class operating use case.

**Founder Control Tower** responsive breakpoints:
- ≤600px: KPIs reflow to 2×2 grid, pipeline stages to 4-column grid, item rows wrap with title first, agent/brand grids go single-column, touch targets ≥44px, no sideways scroll.
- ≤390px: pipeline stages to 2-column grid, KPIs stack.

**Brand Dashboards** (`globals.css`):
- ≤768px: sidebar collapses to fixed bottom navigation (horizontal scroll), main content gets phone-safe padding.
- ≤600px: `.data-table` (the canonical responsive table class) hides `<thead>` and stacks `<td>` as labelled cards via `data-label` attribute.

Breadcrumbs and responsive patterns are built into the shared shell (`DashboardShell.tsx`, `globals.css`) so new brands inherit them from the starter.

### Work lifecycle controls (Founder Control Tower)

The pipeline tab's Work card is the one place the Founder moves Work along its lifecycle: Start, Mark resolved, Send to verification, Verify and close. Rules for any dashboard that shows Work: show only the valid next action for the state; word RESOLVED ("waiting for verification, not closed"), VERIFICATION ("evidence is needed to close it") and CLOSED ("completed and kept in history") differently; ask for what the contract requires (what was done; how it was checked and what was seen); show history behind a tap; keep each control a 44px target and each form one column on a phone; never offer a delete. The server enforces every rule again, so the page is a convenience, not the control. Brand dashboards do not get these controls yet.

### Implementation status by application

| Application | Framework | Breadcrumbs | Mobile nav | Canonical shell | Notes |
|---|---|---|---|---|---|
| **Founder Control Tower** | Astro | Implemented (route-derived) | Implemented (responsive grids, stacked items) | N/A (Astro, control-plane) | `control-tower.astro` |
| **Brand Dashboard starter** | Next.js | Implemented (`Breadcrumbs.tsx` in `DashboardShell`) | Implemented (bottom nav, responsive tables) | Yes (source) | `starters/next-brand-plane/` |
| **Travaholic Caps** | Next.js | Inline in AdminShell topbar | Bottom tab bar + slide-up sheet | On `canonical-dashboard-shell` branch (not merged to main) | Has own evolved shell; canonical branch uses `@retail-os/brand-config` |
| **Moon Glasses** | Next.js | Full breadcrumb nav with path depth | Bottom tab bar + slide-up sheet | On `canonical-dashboard-shell` branch (not merged to main) | Most mature mobile UX of all brands |
| **Ceremony Kitchen** | Next.js | Minimal (group label only) | Bottom tabs + command palette | Not on canonical shell | Client-specific architecture with role-based nav filtering |
| **Korbi** | Astro | None | Flex-wrap only (no bottom nav) | Not on canonical shell | Minimal admin, uses hosted `tokens.css` |
| **Fresh For Paws** | N/A | N/A | N/A | N/A | No deployed dashboard (staged, not deployed) |

Travaholic and Moon have `canonical-dashboard-shell` branches that consume `@retail-os/brand-config`, but these are not merged to main. Their main branches have their own breadcrumbs and mobile navigation already. Ceremony and Korbi are architecturally independent and should migrate to the canonical shell when their dashboard work is next scheduled — not as part of a UX-only block. Korbi (Astro) needs its own migration path.

## Architectural rule

Do not create separate dashboard architectures for individual brands. Use: common Retail OS dashboard structure + brand configuration + enabled modules + brand-specific extensions. Whenever the Retail OS dashboard / Command Centre / admin surface is implemented or migrated, use this common structure as the authoritative standard. A new brand does not invent an unrelated dashboard architecture without explicit architectural justification.

## Phone and desktop check of the viratmohan.com admin pages (6 Oct 2026)

Method: Playwright Chromium, 11 static pages under `/retail-os/admin` at 320, 375, 390, 430 and 1280px (55 loads), phone widths with touch and device scale 3. Data was whatever the local server could read; this checks the page shell and layout, not every data state. Dynamic pages (`plan/[id]`, `design/[id]`, `media/[brandKey]`) were not loaded. The admin pages on `viratmohan.com` only; brand storefronts and the Next.js brand dashboards are separate repos and were not checked.

**LAYOUT VERIFIED:** every load returned 200 with no page error; no page-level horizontal scroll at any width; `.vm-band` present, visible, at the top, full width and 5px on all 55 loads. The Founder Control Tower reads correctly at 390px (breadcrumb, tabs, KPI cards, Ask the CEO tab). The Applications page (`/retail-os/admin`) had a two-column grid that spilled out of its card at phone width; fixed with one breakpoint and checked at 320, 390, 430 and 1280px.

**GAPS (older admin styles, not caused by this release, not fixed here):**
- Breadcrumbs exist only on the Control Tower. The other 10 pages have none.
- Body text is 14 to 15px on phones (the standard is at least 16px); on `/` and `/reports` it is 14px.
- Touch targets under 44px are common: for example 44 of 46 controls on `/`, 255 of 282 on `/brands`, 35 of 40 on `/invoices`, and the Control Tower breadcrumb link (110x19px).
- Form fields under 16px text on phones (43 on `/`, 206 on `/brands`, 30 on `/invoices`), which makes iOS zoom in on focus.

A page-level overflow test does not catch content that spills out of its own container; the Applications page passed it while visibly broken. Check element bounds against their container as well.
