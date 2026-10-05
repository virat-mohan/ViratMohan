# Retail OS brand plane: the canonical Next.js architecture

Why this exists: a new brand should be configured, not forked. Travaholic Caps and Moonglasses were built separately and now share most of their shape. This records what is actually shared, from the code on `main` of both repos (5 Oct 2026), and how the next brand starts without a fork.

Status: proposal, built outside production. Nothing in Travaholic or Moon has been changed by this document. Virat approves before anything migrates.

## 1. Layers

| Layer | Where | Owns |
|---|---|---|
| Control plane | `ViratMohan` (Astro) | Estate, org, leads, invoices, health checks, standards. |
| Shared packages | `@retail-os/brand-config` (v0.3.0, branch `claude/brand-plane-contract`) | Identity, Foundation, Memory, module contract. Types and pure functions only. No values, no secrets. |
| Brand plane | One Next.js app per live brand | Storefront, admin, checkout, the brand's own Supabase project. |
| Brand data | The brand's Supabase project | Orders, customers, `app_settings`. Never shared across brands. |
| Brand extensions | Inside the brand repo | Client-only code (e.g. Ceremony Finance/Ops). Declared in the manifest, never pulled into core. |

Unchanged: each live brand is its own Supabase project and app. No multi-tenancy decision has been made.

## 2. What the code shows

Compared on `main` of `travaholic_caps` and `moon-glasses`:

| File | Result |
|---|---|
| `lib/supabase.ts` (14 lines) | Byte-identical. |
| `lib/settings.ts` | Same pattern, differs (134 vs 129 lines): about 90 keys each, one `app_settings` table. |
| `components/admin/shell/` (AdminShell, nav, CommandPalette) | Same structure, differs (165/74/103 vs 193/114/132 lines). |
| `app/admin/layout.tsx`, `next.config.ts`, `lib/retail-os-brand.ts` | Same role, brand-specific values. |
| `app/admin/*` page folders | Most pages overlap. Trav only: email-campaigns, performance, ux-insights, login. Moon only: creators, master-inventory, models, payment-confirmations, preorders, product-images, social, tagged-posts, team. |
| Env surface | Two real env vars in both: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Everything else lives in `app_settings`. |

Not checked: Ceremony OS (different shape), Korbi, The Feeling Co, and the open PRs on both repos.

## 3. Classification

| Class | Items |
|---|---|
| Shared package (exists) | `RetailOsBrand` identity contract, Brand Foundation lifecycle and gate, Brand Memory, module contract and resolver. |
| Shared package (next, not built) | `getSupabaseServerClient()` (identical today), `app_settings` reader and key registry pattern, admin session signing (section 4). |
| Scaffold (copy once per brand, then configure) | `proxy.ts`, admin layout, AdminShell, CommandPalette, `error.tsx`/`loading.tsx`, `next.config.ts` skeleton. These are React and Next code; they are shaped by the brand's look, so they are templated, not packaged, until two brands have converged. |
| Brand configuration | Identity values, module switches, fonts, colours, nav labels, `app_settings` rows, redirects. |
| Optional module | Marketing, Finance, Creator, Experimentation (see the catalogue in `brand-plane.ts`). |
| Brand-specific | Product pages, journal, 360 viewer, Moon try-on and audio, Trav globe and explorer gallery. |
| Not mature enough | Admin shell as a package (two diverging copies), checkout (money path), customer auth (OTP in Trav, not compared in Moon), Moon's `team` pages. |

## 4. Admin and auth: the standard

The boundary is `proxy.ts` (Next 16), matcher `/admin/:path*` and `/api/admin/:path*`, fail closed. The admin layout has no guard of its own, so nothing is protected if the proxy is missing. Do not copy `proxy.ts` without its session module.

Canonical pattern, taken from Moon (`lib/admin-auth.ts`):
- scrypt password hash in `app_settings`, kept out of the settings key list so the settings API cannot read it;
- HMAC-signed session cookie with expiry and role, `timingSafeEqual` on verify;
- session secret rotates on password change, which revokes every session;
- login and setup routes outside the matcher (`/admin-login`, `/api/admin-auth/*`).

Travaholic differs and is weaker: the cookie is the unsalted `SHA-256(ADMIN_PASSWORD)`, compared with `===`. Anyone who obtains the cookie value holds a permanent credential that is also a crackable hash of the password. It fails closed and is acceptable for a single operator, but a new brand must not copy it. Migrate-later item, quiet hour, with a live check after.

## 5. Module contract

`brand-plane.ts` in the package. A brand supplies a manifest (identity, module ids, declared extensions). `resolveModules(manifest, hasSetting)` returns one status per module:

- `live`: switched on, required settings present, dependencies live;
- `setup_required`: switched on, a setting is missing (names the key, never the value);
- `blocked`: a dependency is not live;
- `available`: exists, not switched on.

Core modules are on by default. Client-specific modules are invisible to every other brand and rejected by `validateManifest`. The nav should render from this result, so a module never shows as working when it is not. 25 of 25 package tests pass, including a catalogue check (unique ids, no cycles).

## 6. Reusable form

Recommendation: packages for contracts and pure logic, plus a starter template for the app scaffold. Not a template alone (it forks on day one) and not packages alone (admin UI is not stable enough to package).

I have not created a template repository. Under the estate guard that needs Virat's approval; until then the scaffold is the `moon-glasses` and `travaholic_caps` files listed in section 3.

## 7. Synthetic reference brand

`reference-brand.ts` in the package: "Sample Goods", `.example` domain, invented values, labelled as sample. It passes identity validation and manifest validation, and resolves every module without touching real data.

## 8. Fresh For Paws: could it be provisioned without a fork?

Yes for identity, modules and data, on these conditions. Per the estate, it has no dedicated repository and I have not created one. Commit `6018b23` shows a staged Retail OS backend (schema, weekly statement, WooCommerce connector), so its commerce source is WooCommerce, not a Next.js storefront. Steps, in order:

1. Virat approves a brand plane for it (a new repo is his call).
2. Write its manifest: identity, modules (Commerce, Customers, Marketing, Finance), no extensions.
3. New Supabase project, `app_settings` seeded, two env vars set.
4. Start from the scaffold, add `proxy.ts` with the Moon session module.
5. Foundation committed from its brand book before any copy goes out.
6. Shipping from `recommendShipping()`, COD off, then health check and launch playbook.

Open question for Virat: it may not need a Next.js storefront at all if its site stays on WooCommerce. Then only the admin plane is built.

## 9. Migrate later, remain local

- Migrate later (each its own change, quiet hour, preview checked): Trav admin auth to the signed-session pattern; both `retail-os-brand.ts` files to the package contract (Moon and Trav already conform to its shape); nav rendered from the resolver.
- Remain local: product and storefront components, brand fonts and CSS tokens, redirects, brand-specific admin pages, Ceremony Finance and Ops.
- Do not touch: checkout, payments, orders, inventory, finance, cron, integrations.

## 10. Anti-fork rule

A new brand starts from a manifest and the scaffold. A capability a second brand needs is classified (core, optional, configuration, client-specific, custom build) before code is written, and goes into the package or the scaffold, not into a copy. Anything client-specific stays in that brand's repo and is declared in its manifest.

## 11. What is not proven

- Whether the scaffold boots as a fresh app: I have not generated one. The contract is proven by tests, not by a running second brand.
- Whether Moon and Trav build against package v0.3.0: not tried, and pinned at v0.2.0 today.
- Admin shell convergence: the two copies differ by 28 to 40 lines per file and I have not diffed them semantically.
