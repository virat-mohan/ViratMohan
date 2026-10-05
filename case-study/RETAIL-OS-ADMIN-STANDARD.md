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

## Relationship to existing brand-plane work

The current Brand Plane scaffold has established the reusable shell and module machinery. Do not immediately rewrite Travaholic or Moon. The next dashboard work should identify: (1) what is already genuinely common, (2) what should become canonical, (3) what is still brand-specific, (4) what should migrate later. Do not abstract unstable differences merely to make the code look uniform.

## Brand Dashboard vs Founder Control Tower

- **Brand Dashboard**: operates one brand (this standard).
- **Founder Control Tower**: operates DevShop / all brands / agents / work / decisions.

These are distinct. Do not merge them into one giant interface.

## Architectural rule

Do not create separate dashboard architectures for individual brands. Use: common Retail OS dashboard structure + brand configuration + enabled modules + brand-specific extensions. Whenever the Retail OS dashboard / Command Centre / admin surface is implemented or migrated, use this common structure as the authoritative standard. A new brand does not invent an unrelated dashboard architecture without explicit architectural justification.
