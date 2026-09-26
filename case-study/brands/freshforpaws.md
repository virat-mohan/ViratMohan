# Fresh For Paws

One place for everything done on Fresh For Paws so far. Pulled together on 26 Sep 2026 from Gmail, the ViratMohan.com Supabase project and this repo.

## The brand
- Founder: Srishti Bhatia, contact@freshforpaws.com
- Site: https://freshforpaws.com (WooCommerce). Instagram: @freshforpaws
- Category: fresh-cooked, ready-to-eat dog and cat meals. D2C.
- Store categories: Dog meals, Cat meals (Fresh For Purrs), Puppy meals (Mini Paws), Treats & toppers, Combos
- Revenue ₹1L–5L a month, 5K–50K following, 10–50 products (self-reported on the application)
- Target cities: Delhi NCR, Gurugram, Noida. Free shipping over ₹999. No returns. COD and prepaid.

## The deal (as it stands)
- Front end stays WooCommerce. Retail OS runs behind it.
- 25% profit share. Pay with a Post at 1%.
- ₹5,000 deposit, adjusted against actual onboarding tech costs.
- Nothing signed yet.

## Timeline
| Date | What happened | Source |
|---|---|---|
| 24 Sep | Retail OS application submitted; forecast prep started | Supabase `retail_os_applications` id `8ad86490…`; Gmail "Fresh For Paws: your forecast is being prepared" |
| 26 Sep | Call with Srishti; mutual NCNDA sent to contact@freshforpaws.com | Gmail "Fresh For Paws x DevShop Retail OS: NCNDA to sign first" |
| 26 Sep | Onboarding task list (14 tasks) loaded to ops board | Supabase `retail_os_ops_tasks`, brand_key `freshforpaws` |
| 26 Sep | Lead logged, stage `nda_sent` | Supabase `leads` id `c8cfb848…` |

Track page: https://www.viratmohan.com/retail-os/track/8ad86490-b731-49a1-92c8-a98a68ec0441

## Next step
Srishti signs the NCNDA. If nothing by Mon 29 Sep, chase her, then collect WooCommerce admin access, product list and current order volume. Why: the build can't be scoped without catalog and order data.

## Open tasks (all `todo`)
| Stage | Task | Owner |
|---|---|---|
| 0 Prerequisites | Chase signed NCNDA by 29 Sep; then Woo access, products, order volume | team |
| 0 Prerequisites | NCNDA signed, terms signed at 25%, deposit marked paid | founder |
| 1 Foundations | Shop Manager WordPress user + WooCommerce REST API key (read) for DevShop | brand |
| 1 Foundations | Record hosting, registrar and who holds each login (names only) | team |
| 1 Foundations | Create freshforpaws-os Supabase project, GitHub repo, Vercel project | founder |
| 2 Payments | Record current gateway and settlement bank; don't move payments until legal view is in | team |
| 3 Shipping | From Srishti: meals/day capacity, delivery method, zones, pincodes, slots, cold chain | brand |
| 3 Shipping | Shiprocket or local courier only if own delivery can't cover zones | team |
| 4 Email | Brand email on their domain; Resend domain verified | team |
| 5 WhatsApp | Keep current number or new WhatsApp Business API number | brand |
| 5 WhatsApp | Meta BM partner request, Business Verification, templates | team |
| 6 Instagram | Connect @freshforpaws once backend admin exists | team |
| 7 Ads | Ad account + pixel partner access; GA and Search Console invites | team |
| 8 Admin | Admin setup code used once; password set | team |
| 9 Handover | Sheet from Srishti: products with cost, pack size, shelf life; order and customer export; photos | brand |

## Gaps I found
- The lead isn't linked to the application (`leads.application_id` is empty).
- The application's founder email is viratmohan@gmail.com, not Srishti's. The confirmation email went to Virat, not her.
- No freshforpaws repo, Supabase project or Drive folder exists yet (checked `list_repos`, Supabase projects, Drive search).
