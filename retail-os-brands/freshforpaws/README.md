# freshforpaws-os (staged in viratmohan.com: `retail-os-brands/freshforpaws/`; move to its own repo when one can be created)

Retail OS backend for **Fresh For Paws** (freshforpaws.com). The store front stays on WooCommerce and Razorpay; this project runs behind it.

Classification (CLAUDE.md, product architecture): **Core Retail OS + brand configuration**. The only new code is the WooCommerce connector (`supabase/functions/woo-*`), built as a reusable Retail OS integration any WooCommerce brand can turn on.

## What is here

| Path | What it does |
|---|---|
| `supabase/migrations/0001_retail_os_core.sql` | Standard Retail OS tables (`orders`, `order_items`, `customers`, `products` with Inventory Master fields, `app_settings`, `expenses`, `whatsapp_messages`, `business_plans`, `tracking_events`), named exactly as the other live brands so the viratmohan.com console reads it unchanged. Adds `weekly_statements` and `compute_weekly_statement()` for the agreed split. RLS on, service role only. |
| `supabase/functions/woo-webhook` | Receives WooCommerce `order.*` and `product.*` webhooks, checks the HMAC signature, upserts the order, items and customer. |
| `supabase/functions/woo-sync` | Hourly safety-net pull from the WooCommerce REST API (read key), plus a one-off 90-day backfill. |

## Commercials (agreed 1 Oct 2026, stored in `app_settings`)

On every online order: product cost 25% of the sale price, taken first · marketing at actual spend, counted up to 25% · admin and tech support at actual spend, counted up to 10% · the balance is the profit pool, of which DevShop gets 25%. Actuals are entered in `expenses` (category `marketing` or `admin_tech`), Meta spend included. Pay with a Post: 1% of those orders. Sales on Supertails are Fresh For Paws's own business and outside the split. We still connect Supertails data (view-only, in its own channel, never mixed with website numbers) because it shows what to build and how to sell (Virat, 10 Oct 2026). Razorpay pays Fresh For Paws first; every Monday 12 PM IST a statement goes out for reconciliation and closure, then one invoice (DevShop share + Pay with a Post fee), which Fresh For Paws transfers.

`select * from compute_weekly_statement('2026-10-05');` gives the week starting that Monday (IST). Tested locally on Postgres 16 (see below).

## Connection checklist

Status as of 1 Oct 2026. Access comes from Srishti to **tech@viratmohan.com** (see the minutes sent 1 Oct).

| # | Connection | Needs | Who | Status |
|---|---|---|---|---|
| 1 | Supabase project `freshforpaws-os` (ap-south-1, Mumbai) | Create, then apply `0001` | DevShop | **Blocked:** project creation timed out twice from the agent; create in the Supabase dashboard |
| 2 | WooCommerce REST key | WP admin as Shop Manager → WooCommerce → Settings → Advanced → REST API → Add key, user devshop, **Read**. Set `WOO_STORE_URL=https://freshforpaws.com`, `WOO_CONSUMER_KEY`, `WOO_CONSUMER_SECRET` as function secrets | DevShop, after Srishti adds the Shop Manager user | Waiting on access |
| 3 | WooCommerce webhooks | WooCommerce → Settings → Advanced → Webhooks: `Order created`, `Order updated`, `Product updated` → `https://<ref>.supabase.co/functions/v1/woo-webhook`, secret = `WOO_WEBHOOK_SECRET` | DevShop | Waiting on 1 and 2 |
| 4 | Backfill | `POST /functions/v1/woo-sync?backfill_days=90` with header `x-cron-secret` | DevShop | After 3 |
| 5 | Hourly sync | pg_cron + pg_net calling `woo-sync` every hour with `x-cron-secret` | DevShop | After 4 |
| 6 | Console | Add `RETAIL_OS_BRAND_FRESHFORPAWS_URL`, `..._SERVICE_KEY`, `..._NAME=Fresh For Paws` in Vercel (viratmohan.com) and redeploy | Virat (secret) | After 1 |
| 7 | Products sheet | Fill `products.cost_per_pack`, `pack_size`, `shelf_life_days` from Srishti's sheet | DevShop | Waiting on sheet |
| 8 | Razorpay (view only) | Reconcile `razorpay_payment_id` against settlements for the Monday statement | DevShop | Waiting on invite |
| 9 | Meta | Partner access (DevShop Business ID) → `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` in `app_settings`; Pixel + Conversions API on WooCommerce | DevShop | Waiting on access |
| 10 | GA4 / Search Console | Viewer / Restricted for tech@viratmohan.com | Srishti | Waiting |
| 11 | WhatsApp | Keep 97179 70559 or a new Business API number; templates approved by Srishti, then Meta | Srishti decides | Open |
| 12 | Delivery | Own riders or courier; zones, pincodes, slots, cut-off, cold chain | Srishti | Open |
| 13 | Order emails from freshforpaws.com | DNS records at the registrar | DevShop, after registrar access | Waiting |
| 14 | Pay with a Post | Orders flagged with meta `_pay_with_a_post = yes` set `is_post_barter` | DevShop | When the module is switched on |

Note: Retail OS standard is COD off. Fresh For Paws runs its own WooCommerce checkout; COD orders are tracked (`payment_type = 'cod'`) and not changed here. Turning COD off on their checkout is Srishti's call, recommended by Virat.

## Deploy

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy woo-webhook --no-verify-jwt   # auth is the WooCommerce HMAC
supabase functions deploy woo-sync --no-verify-jwt      # auth is x-cron-secret
supabase secrets set WOO_STORE_URL=https://freshforpaws.com WOO_CONSUMER_KEY=... WOO_CONSUMER_SECRET=... WOO_WEBHOOK_SECRET=... CRON_SECRET=...
```

Secrets are set in Supabase only. Never in code, chat or email.
