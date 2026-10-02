# Retail OS brand onboarding checklist (the standard)

One checklist for every new brand, every tech-stack connector. It sits beside the ops seeds in `src/lib/ops-seed.ts` (`BRAND_SETUP_TASKS`) and the access list in `src/lib/lead-access.ts`; if they disagree, bring them in line with this file.

**Owners**
- **CEO agent**: the brand's Claude CEO agent. Anything doable by API, code or data in the brand repo and its Supabase project.
- **Prince**: internal tech-stack connecting only (accounts, integrations, keys by named invitation, webhooks, templates, DNS, deploys, setup records). Never client contact, marketing, catalog, data entry or commercial terms. Assigned only when Virat says so (CLAUDE.md), and every task he gets goes on his checklist too.
- **Virat**: his logins, money, payment accounts, and every message to the founder or client. The team prepares; Virat sends.

**Rules that apply to every row**
- Every access request to the client names **tech@viratmohan.com**. Meta access goes to the DevShop Business ID.
- Keys are entered in the brand's `/admin/settings` (stored in `app_settings`) or in Vercel env. Never in chat, email, or code.
- "Proof of done" must be something another agent can check: a key name present, a 200 response, a test event, or a row.
- Checkout is prepaid/UPI only; `COD_DISABLED` stays on.

## 1. Domain, DNS and email sending

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| Ask the founder to point nameservers at Cloudflare, or to invite tech@ to the registrar | Virat | One line in his founder message | Cloudflare zone shows Active | Day 0, first |
| Store DNS records (apex + www to Vercel) | Prince | Cloudflare dashboard | `dig` resolves; domain shows Valid in Vercel | After the zone, the Vercel project |
| Sending domain in Resend (or Brevo); SPF, DKIM, DMARC `p=none` to start | Prince | Add the provider's records in Cloudflare | Provider shows Verified; `dig TXT _dmarc.<domain>` returns a record | After the zone |
| `RESEND_API_KEY` (or `BREVO_API_KEY`) in settings | Prince | Key created under tech@, pasted into /admin/settings | Key name present in `app_settings` | After verification |
| Test send to every internal alert address | CEO agent | Trigger the order email in code | Arrives in each inbox, not spam | After the key |
| Raise DMARC to `quarantine` after 2 clean weeks | Prince | Cloudflare TXT edit | `dig` shows `p=quarantine` | Week 3 |

## 2. Vercel, Supabase, GitHub

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| Supabase project and GitHub repo from the white-label template | Prince | Accounts under tech@; Virat's org pays | Project id recorded in setup record | Day 0 |
| Migrations applied, RLS on | CEO agent | Supabase MCP / migration files | `get_advisors` has no security errors | After the project |
| Vercel project linked; env set (Supabase URL/keys, `ADMIN_SESSION_SECRET`, `CRON_SECRET`) | Prince | Vercel dashboard, by invitation | Deploy green; `/` returns 200 | After the repo |
| Vercel plan / billing, if paid | Virat | His card | Plan shown in Vercel | Before go-live |
| Cron routes in `vercel.json` call with `CRON_SECRET`; a call without it gets 401 | CEO agent | Code + curl | 401 without, 200 with | After env |

## 3. Payments (UPI first, Razorpay optional)

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| Founder's UPI ID and QR image | Virat | Ask the founder | Received | Day 0 |
| `UPI_ID`, `UPI_PAYEE_NAME`, `UPI_QR_IMAGE_URL` in settings | CEO agent | Upload QR to storage, write settings | Keys present; checkout shows the QR | After the UPI ID |
| Razorpay KYC and account (founder's business) | Virat | Founder does KYC; Virat asks for a tech@ team invite | Team invite accepted | Start Day 0, parallel |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` in settings | Prince | Keys from the dashboard, by invitation | Keys present | After KYC |
| Webhook URL + `RAZORPAY_WEBHOOK_SECRET` | Prince | Razorpay dashboard + settings | Test webhook marks a test order paid | After the keys |
| COD off, card off, UPI on, server rejects `cod_advance` | CEO agent | `COD_DISABLED` flag + checkout config | Health check payment block passes | Before go-live |

## 4. Shipping (Shiprocket)

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| Shiprocket account, wallet funded, pickup address | Virat | Founder funds the wallet (money) | Wallet balance > 0 | Day 1 |
| API user (separate email), `SHIPROCKET_EMAIL/PASSWORD/PICKUP_LOCATION/PICKUP_PINCODE` | Prince | Shiprocket settings + /admin/settings | Keys present; token caches | After the account |
| Tracking webhook + `SHIPROCKET_WEBHOOK_TOKEN` | Prince | Shiprocket webhook settings | Status update lands on a test order | After the API user |
| Shipping model from `recommendShipping()` with real weights and boxes | CEO agent | Run on the catalog; record `shipping_charge_model` | Model stored; rate shown before payment where needed | After the catalog is in |

## 5. Meta: Business, pixel, catalog, ads

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| Founder shares Page, IG, ad account, pixel, catalog with the DevShop Business ID | Virat | Founder message | Assets visible in DevShop Business Manager | Day 0 |
| Meta Business Verification submitted | Virat | Founder's documents | Submitted / Verified | Day 0 (takes weeks) |
| Meta app, System User token: `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_PAGE_ID` | Prince | Business Manager, by invitation | Graph `/me` call works from the agent | After sharing |
| `META_PIXEL_ID` + CAPI events (ViewContent, AddToCart, Purchase) | CEO agent | Code; test events code | Events Manager shows browser + server Purchase, deduped | After the token |
| Catalog / Commerce Manager feed and Instagram Shopping | Prince (connect) / CEO agent (feed) | Feed URL from the store; Commerce Manager setup | Catalog shows products; IG Shopping approved | After the pixel |
| `META_AD_ACCOUNT_ID`, ad cap and ROAS floor (`PM_*`) | CEO agent | Settings | Keys present | After access |
| Ad account payment method and budget | Virat | His card / founder's | Account active | Only when ads start |

## 6. WhatsApp

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| Choose provider: MSG91 or Meta Cloud API (`WHATSAPP_PROVIDER`) | CEO agent | Settings | Key present | Day 1 |
| Brand number on Embedded Signup, coexistence mode | Prince | Embedded Signup with the founder's number (Virat gets the OTP from the founder) | Number shows Connected | After Meta sharing |
| `MSG91_AUTH_KEY` + `MSG91_WHATSAPP_INTEGRATED_NUMBER`, or `META_WHATSAPP_ACCESS_TOKEN` + `META_WHATSAPP_PHONE_NUMBER_ID` | Prince | Provider dashboard + settings | Test send arrives | After the number |
| Template wording from the brand book | CEO agent | Draft via `brandVoicePrompt()`, pass `checkVoice()` | Copy approved by Virat | Before templates |
| Templates created and approved (order confirmation, shipping, OTP minimum); WABA id matches | Prince | Provider dashboard | Template ids in settings | After wording |
| Inbound webhook + `MSG91_INBOUND_WEBHOOK_TOKEN` / `META_WEBHOOK_VERIFY_TOKEN` | Prince | Callback URL from /admin/social | Inbound message shows in the shared inbox | After the number |

## 7. Instagram Graph and comment-to-DM

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| IG is a Professional account linked to the Page | Virat | Ask the founder | Shown in Business Manager | Day 0 |
| Instagram use case + permissions; Connect Instagram; `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Prince | Meta app + /admin/social | Handle shows with counts | After the Meta token |
| Webhook subscribed to comments, mentions, messages | Prince | Meta app webhooks | Test comment hits the inbox | After connect |
| Comment-to-DM rules and reel-matched links (fixed UTMs) | CEO agent | Code + settings | Test comment gets the DM with the right link | After the webhook |

## 8. Google and Clarity

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| Ask founder for GA4, Search Console, Merchant Center access for tech@ (or create new) | Virat | Founder message | Invite accepted by tech@ | Day 0 |
| GA4 property + tag; `GA4_PROPERTY_ID` | Prince | GA admin; tag in the repo env | Realtime shows a visit | After access |
| Search Console domain property (DNS TXT) + sitemap | Prince | Cloudflare TXT, submit sitemap | Property Verified; sitemap Success | After the DNS |
| Merchant Center free listings, feed from the store | Prince (account) / CEO agent (feed) | Feed URL | Products Approved | After GSC |
| Clarity project; `CLARITY_PROJECT_ID`, `CLARITY_API_TOKEN` | Prince | Clarity under tech@ | Recordings appear | Day 2 |

## 9. Brand book, admin, health

| Step | Owner | How | Proof of done | Order / depends on |
|---|---|---|---|---|
| Brand book gaps asked of the founder | Virat | Founder message (gaps listed by the CEO agent) | Answers received | Day 0 |
| `lib/brand-voice.ts` + its test; `checkVoice()` before every send; `brandVoicePrompt()` in every AI prompt | CEO agent | Code, Ceremony OS as reference | Test passes; a blocked phrase blocks | Before any customer-facing word |
| Admin nav matches RETAIL-OS-ADMIN-STANDARD.md; Integrations page shows every connector | CEO agent | Code | Page review against the standard | Day 3 |
| Founder admin login with the one-time setup code (`ADMIN_SETUP_CODE_HASH`); team logins (`ADMIN_TEAM`) | Virat | Sends the founder the code; founder sets own password | Founder logged in | Day 5 |
| Admin locked to the public | CEO agent | Code | `/admin` without a session is refused | Before go-live |
| Brand added to BRANDS in `scripts/health/check.mjs` | CEO agent (Myoho in this repo) | Code | Health run passes for the brand | Launch day |
| Every link checked live, then launch per LAUNCH-PLAYBOOK.md | CEO agent checks, Virat approves and sends | `link-check.ts` / fetch | All 200 | Day 7 |

## Day 1 to Day 7

| Day | What finishes |
|---|---|
| 0 (signed + deposit) | Virat sends one access message: nameservers, Meta sharing to the Business ID, tech@ invites (GA, GSC, Merchant, Razorpay, Shiprocket), UPI ID + QR, brand book gaps. Business Verification and Razorpay KYC start. Supabase, repo, Vercel created. |
| 1 | DNS live, store deploys, UPI checkout takes money. Shiprocket account funded. Provider picked for WhatsApp. |
| 2 | Email domain verified, Shiprocket API + webhook, Clarity, Razorpay keys if KYC cleared. Brand voice module in. |
| 3 | WhatsApp number connected, templates submitted, admin nav to standard. |
| 4 | Webhooks: WhatsApp inbound, Instagram connected, comment-to-DM tested. |
| 5 | Pixel + CAPI, catalog feed, GA4/GSC/Merchant, founder admin login. One real order end to end. |
| 6 | Go-live review: every money path, link, email, WhatsApp, label. Health check entry added. |
| 7 | Public. Virat sends the go-live note; first Monday results scheduled. |

---

## Current state (2 Oct 2026)

Evidence: key names present with a value in each brand's `app_settings` (read-only SQL; Travaholic `mdornfpcskvjnuawqpqf`, Moonglasses `fewnyteoprmuyzfvopnb`, Ceremony `jnfapkxpkdizwjzrccjm`), `lib/brand-voice.ts` in each repo, BRANDS in `scripts/health/check.mjs`, and public DNS (`dig`). Env-only items (Vercel env, `CRON_SECRET`) can't be seen from the database, so they're marked unknown. Ceremony runs on Shopify with Interakt for WhatsApp, so some store rows don't apply (n/a). `docs/REVENUE-ACTIONS-FOR-VIRAT.md` was not found in the Travaholic repo.

| Connector / step | Travaholic Caps | Moonglasses | Ceremony |
|---|---|---|---|
| Sending domain DKIM | unknown (Brevo; no Resend DKIM record) | done (resend._domainkey) | done (resend._domainkey) |
| SPF on send domain | missing (no SPF at apex or send.) | done | done |
| DMARC | done (p=none) | done (p=none) | done (p=quarantine) |
| Email key | done (BREVO, RESEND) | done (RESEND) | done (RESEND) |
| Vercel env, CRON_SECRET | unknown (not in DB) | unknown | unknown |
| Supabase + admin session secret | done | done | unknown (no ADMIN_SESSION_SECRET key; Shopify login) |
| UPI ID + QR | missing | done | n/a (Shopify checkout) |
| Razorpay keys | done | done | n/a |
| Razorpay webhook secret | missing | missing | n/a |
| Shiprocket API + webhook token | done | done | n/a / unknown |
| Meta token | done | done | done |
| Meta pixel | done | missing | done |
| Meta ad account | done | missing | done |
| Meta Page id | done | missing | done |
| Catalog / IG Shopping | unknown | unknown | unknown |
| WhatsApp provider keys | done (MSG91) | done (MSG91 + Cloud API) | done (Interakt) |
| WhatsApp templates (order, ship, OTP) | done | done | unknown |
| WhatsApp inbound webhook token | missing (MSG91_INBOUND_WEBHOOK_TOKEN) | done | unknown |
| Instagram business account id | done | missing (Instagram Login connection only) | done |
| Meta webhook verify token | done | done | missing |
| GA4 | missing | missing | done |
| Search Console | unknown | unknown | unknown |
| Merchant Center | unknown | unknown | unknown |
| Clarity | done | missing | missing |
| Brand book module | done | done | done |
| Health check entry | done | done | done |
| Founder admin login / team | unknown (no setup code row) | done (ADMIN_SETUP_CODE_HASH, ADMIN_TEAM) | unknown |
