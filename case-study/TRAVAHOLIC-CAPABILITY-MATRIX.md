# Travaholic Caps — capability preservation matrix

Inventory date: 2026-10-05. Source: `virat-mohan/Travaholic_caps` repository.
Framework: Next.js 16 (App Router), Supabase, Vercel.

This matrix maps every Travaholic admin capability to its canonical Retail OS section. Nothing is removed. Every route is accounted for.

## Admin page routes (34 pages)

| Route | Label | Canonical Section | In Nav | Notes |
|---|---|---|---|---|
| `/admin/` | Command Centre | Command Centre | Landing | Always visible |
| `/admin/brand-profile` | Brand Profile | Brand | Yes | |
| `/admin/edit-chapter` | Edit Chapters | Catalogue | Yes | "Chapter" = product in Travaholic |
| `/admin/add-chapter` | Add Chapter | Catalogue | Yes | |
| `/admin/marketing-assets` | Marketing Assets | Catalogue | Yes | |
| `/admin/orders` | Orders | Commerce | Yes | |
| `/admin/orders/new` | Add Manual Order | Commerce | Yes | |
| `/admin/post-barter` | Pay With A Post | Commerce | Yes | Travaholic-specific feature (reusable module) |
| `/admin/post-barter/preview` | Barter Preview | Commerce | Hidden | Sub-route of post-barter |
| `/admin/returns` | Return Requests | Commerce | Yes | |
| `/admin/discounts` | Discount Rules | Commerce | Yes | |
| `/admin/coupons` | Coupon Codes | Commerce | Yes | |
| `/admin/analytics` | Website Analytics | Growth | Yes | |
| `/admin/ux-insights` | UX Insights (Clarity) | Growth | Yes | |
| `/admin/ad-briefs` | Ad Brief Generator | Growth | Yes | |
| `/admin/content-calendar` | Content Calendar | Growth | Yes | |
| `/admin/reports` | Growth Reports | Growth | Yes | Could also appear in Reports |
| `/admin/abandoned-carts` | Abandoned Carts | Growth | Yes | |
| `/admin/email-campaigns` | Email Campaigns | Growth | Yes | |
| `/admin/performance` | Performance Manager | Growth | Yes | |
| `/admin/agent-log` | Ad Agent | Growth | Yes | |
| `/admin/journal-drafts` | Journal Draft Generator | Growth | Yes | |
| `/admin/newsletter` | Newsletter | Growth | Yes | |
| `/admin/whatsapp` | WhatsApp Inbox | Growth | Yes | Shared module (every brand) |
| `/admin/customers` | Customers & Miles | Growth | Yes | Includes loyalty program |
| `/admin/leads` | Leads | Growth | Yes | |
| `/admin/explorer-submissions` | Explorer Submissions | Growth | Yes | Community/UGC submissions |
| `/admin/reviews` | Reviews | Growth | Yes | |
| `/admin/inventory` | Inventory | Inventory Master | Yes | |
| `/admin/pnl` | P&L | Finance | Yes | |
| `/admin/business-plan` | Business Plan | Finance | Yes | |
| `/admin/expenses` | Expenses | Finance | Yes | |
| `/admin/logistics` | Shipments & RTO | Operations | Yes | Shiprocket integration |
| `/admin/settings` | API Keys & Settings | Settings | Yes | |
| `/admin/login` | Login | — (infra) | Hidden | Authentication, not a dashboard page |

## Hidden API capabilities (no dedicated page)

| API Route | Capability | Canonical Section |
|---|---|---|
| `/api/admin/agent-config` | CEO agent configuration | Settings |
| `/api/admin/growth-recommendations` | AI growth recommendations | Growth |
| `/api/admin/hero-override` | Homepage hero control | Catalogue |
| `/api/admin/legacy-winback` | Legacy winback campaigns | Growth |
| `/api/admin/loyalty-config` | Loyalty program config | Growth |
| `/api/admin/ops-digest` | Operations digest | Operations |
| `/api/admin/orders/print-labels` | Shipping label printing | Commerce |
| `/api/admin/pnl/export` | P&L data export | Finance |
| `/api/admin/reports/daily` | Daily report generation | Reports |
| `/api/admin/upload` | File upload | — (infra) |
| `/api/admin/marketing-assets/seed` | Seed marketing assets | Catalogue |
| `/api/admin/performance/report-preview` | Performance report preview | Growth |

## Cron jobs (12 scheduled tasks)

| Cron Route | Capability | Section |
|---|---|---|
| `abandon-sweep` | Abandoned cart recovery | Growth |
| `ad-agent` | Automated ad management | Growth |
| `checkout-health` | Checkout monitoring | Operations |
| `clarity-sync` | Microsoft Clarity sync | Growth |
| `email-campaign` | Scheduled email sends | Growth |
| `ops-digest` | Ops digest generation | Operations |
| `payment-reconcile` | Payment reconciliation | Finance |
| `performance-manager` | Performance tracking | Growth |
| `publish-queue` | Content publish queue | Growth |
| `sales-signal-briefs` | Sales signal ad briefs | Growth |
| `track-sweep` | Shipment tracking | Operations |
| `winback` | Customer winback | Growth |

## Webhooks (5 handlers)

| Webhook | Source | Section |
|---|---|---|
| `courier-status` | Shiprocket | Operations |
| `meta` | Meta (Facebook/Instagram) | Growth |
| `msg91-whatsapp-inbound` | MSG91 WhatsApp | Growth |
| `msg91` | MSG91 SMS/email | Growth |
| `razorpay` | Razorpay payments | Commerce |

## Mobile tab bar

Orders, Customers, Shipping, Finance — four quick-access tabs on phone.

## Canonical sections with no Travaholic routes (yet)

| Section | State | Reason |
|---|---|---|
| Team & Partners | Available | No team management pages built |
| Reports | Available | `/admin/reports` exists under Growth as "Growth Reports" |

## Preservation rules

1. Every route listed above stays reachable at its current path.
2. The nav regrouping (branch `canonical-dashboard-shell`) adds `canonicalSection` to each nav section — it does not rename, remove, or hide any link.
3. Old paths that change in the future must redirect to the standard path.
4. "Common structure ≠ feature reduction" — this matrix proves nothing was lost.
