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

## Architectural rule

Do not create separate dashboard architectures for individual brands. Use: common Retail OS dashboard structure + brand configuration + enabled modules + brand-specific extensions. Whenever the Retail OS dashboard / Command Centre / admin surface is implemented or migrated, use this common structure as the authoritative standard. A new brand does not invent an unrelated dashboard architecture without explicit architectural justification.
