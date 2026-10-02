# Retail OS brand dashboard: one standard for every brand

Every brand's admin looks and works the same: same sections, same names, same order, same URLs, same look. A founder who knows one Retail OS dashboard knows them all. Brand-only features sit in one clearly labelled group at the end, never mixed into the core.

Classification: **core Retail OS**. Reference implementation: Travaholic Caps (Moonglasses shares its codebase). Ceremony OS maps to the same structure; Ceremony Finance and Ceremony Ops are client-specific extensions.

## Navigation (exact names, exact order)

| Group | Pages (path) |
|---|---|
| **Command Centre** | Today (`/admin`): sales, orders, spend, cost per order, funnel, what needs you, for the selected period vs the period before |
| **Commerce** | Orders (`/admin/orders`) · Products (`/admin/products`) · Inventory Master (`/admin/inventory`) · Customers (`/admin/customers`) · Returns (`/admin/returns`) · Shipping (`/admin/shipping`) · Discounts & codes (`/admin/discounts`) |
| **Inbox** | WhatsApp (`/admin/inbox`): every customer conversation, one thread per customer · Leads (`/admin/leads`) |
| **Marketing** | Content calendar (`/admin/calendar`) · Social (`/admin/social`) · Email (`/admin/email`) · WhatsApp campaigns (`/admin/whatsapp-campaigns`) · Creators & Pay with a Post (`/admin/creators`) · Reviews (`/admin/reviews`) · Ads (`/admin/ads`) |
| **Growth Intelligence** | Where orders came from (`/admin/channels`) · Website & funnel (`/admin/analytics`) · Visitor insights (`/admin/ux`) · Reports (`/admin/reports`) |
| **Finance** | P&L (`/admin/pnl`) · Expenses (`/admin/expenses`) · Weekly statement (`/admin/statements`) · Business plan (`/admin/plan`) |
| **Operations** | Approvals (`/admin/approvals`) · Tasks (`/admin/tasks`) |
| **Brand & settings** | Brand profile (`/admin/brand`) · Integrations (`/admin/integrations`): every connection with its status and the exact fix · Team & access (`/admin/team`) · Settings (`/admin/settings`) |
| **Extensions** (only if the brand has any) | Client-specific pages, e.g. Ceremony Finance, Ceremony Ops, Kitchen |

Rules:
- A page that a brand doesn't use yet is hidden, not renamed. Old paths redirect to the standard ones so no link breaks.
- The same word means the same thing everywhere: "Orders" not "Sales", "Inventory Master" (canonical, never renamed), "Where orders came from", "Cost per order", "Weekly statement".
- Every list page: filter bar (period: today, this week, last week, month to date, last month, custom; compare: period before, last month, last year), then summary tiles, then the table. Every number shows its source.

## Look
viratmohan.com tokens (`/brand/tokens.css`): paper background, ink text, gold and terracotta accents, serif headings, sans body; DevShop Retail OS mark top left, brand name beside it; left sidebar on desktop, bottom sheet menu on phones; no sideways scroll at 390px; calm, one idea per screen. The brand's own colours appear only in its logo and its storefront, never in the admin chrome.

## Shared modules every brand gets
- **WhatsApp inbox** (Inbox → WhatsApp): the brand connects its own WhatsApp Business number with Meta's Embedded Signup in coexistence mode, so the number keeps working in the phone app and every message also lands here. Replies from the dashboard or the phone show in both. A bot answers routine questions later from the brand's Brain and product data, handing anything else to a person in the same thread.
- **Where orders came from** (Growth Intelligence → Channels): orders by channel, overall and ads cost per order (see GROWTH-MACHINE.md).
- **Integrations**: one page showing every connection (payments, shipping, Meta, WhatsApp, Instagram, email, Google) as connected, needs attention, or not set up, with the exact fix.
