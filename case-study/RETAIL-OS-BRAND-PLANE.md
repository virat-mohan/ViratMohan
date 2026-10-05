# Retail OS Brand Plane

The authoritative description of how a Retail OS brand is built. Verified against the code on `main` of `travaholic_caps` and `moon-glasses` on 5 Oct 2026, and against the package and starter built from it.

Status: the package (`@retail-os/brand-config` v0.3.0) and the starter are built and tested on branch `claude/brand-plane-contract` of `virat-mohan/retail-os-brand-config`, not yet merged. No production brand has been changed or migrated.

## What is the Brand Plane?

Retail OS has two planes.

- **Control plane**: `ViratMohan` (Astro). Estate, org, leads, invoices, health checks, standards.
- **Brand plane**: one Next.js app per brand. Storefront, admin, checkout, and the brand's own Supabase project.

A new brand goes: **registration → identity → committed Foundation → module manifest → brand data connection → deployment.** It provides configuration. It does not edit platform internals and does not fork another brand.

## Why Next.js?

Both live stores already run Next.js 16 with the same shape (App Router, `proxy.ts`, server-side service-role Supabase, `app_settings`). Standardising on what is proven avoids a migration. The shared contracts stay framework-neutral so the Astro control plane can read them too.

## What is shared, and what is brand-specific?

| Layer | Shared | Brand-specific |
|---|---|---|
| Package `@retail-os/brand-config` | identity contract, Foundation lifecycle and gate, Brand Memory, `BrandConfig`, module registry and status, admin access policy, voice mechanics, nav groups, render models | nothing. No brand values, no secrets |
| Starter (`starters/next-brand-plane`) | admin shell, `proxy.ts` boundary, Supabase boundary, settings reader, error and loading conventions, env contract, reference session | `brand/config.ts`, `brand/foundation.ts`, `brand/voice.ts`, `.env` |
| Brand repo | the platform code it inherited, unchanged | storefront, product pages, brand fonts and CSS, extensions, data |

Classification of every capability follows `CLAUDE.md`: core, optional module, brand configuration, client-specific extension, custom build.

## What is `@retail-os/brand-config`?

A private, framework-neutral package of types and pure functions, pinned by commit SHA. No runtime dependencies, no network, no values. v0.3.0 adds to the earlier identity, Foundation and Memory modules: `brand-config`, `modules`, `module-status`, `admin-gate`, `voice-contract`, `foundation-gate`, `navigation`, `render-contract`, `reference-brand`. Apps import by subpath. The compiled `dist` loads in plain Node and in bundlers.

## The identity contract (one)

Canonical: **`RetailOsBrand`** in `brand-identity.ts`.

- It is what both live stores already render from. Compile-time check: Travaholic's and Moon's `brand` objects on `main` are each assignable to it with no adapter.
- The control-plane incubator also had a `BrandIdentity` type (`retail-os/brand-config/types.ts`). It has no consumers in any repo, so it is retired, not aliased. Its three unique ideas moved: `legalName` and `assets.faviconPath` are now optional fields on `RetailOsBrand`; design tokens became `BrandConfig.design`, because tokens are design, not identity.
- `BrandConfig.identity` is a `RetailOsBrand`. Currency symbol and product noun come from `identity.profile` and are not repeated in commerce.
- Changes to `RetailOsBrand` are additive (optional fields), so stores pinned to an earlier version are unaffected, including open PRs travaholic_caps#5 and moon-glasses#3.
- Adapters needed today: none. Add one only when a consumer genuinely differs.

## How Brand Foundation works

Human brand book → committed Foundation → runtime consumers. The lifecycle is draft, review, approved, committed, superseded, and `isDownstreamAllowed()` is true only for committed. Approving and committing need a named person.

Runtime code (`brand-voice`, prompts, send paths) reads values from the committed Foundation and refuses to run from anything else. Shared: `requireCommitted`, the drift check, the voice finding types, the checker interface, and `createVoiceGate`. Not shared, ever: the voice itself, positioning, claims, vocabulary, visual rules, commercial facts. Those stay in the brand.

Difference to note: Travaholic's gate allows a send if its checker itself crashes; Moon's has no guard. The shared gate fails closed by default (`onCheckerError: "block"`), with `"allow"` as an explicit opt-in.

## How admin auth works

Policy, identical for every brand and implemented once in `admin-gate`:

- `/admin/*` and `/api/admin/*` protected, path matching by segment (so `/admin-login` and `/administrator` are not admin);
- unauthenticated API: 401; unauthenticated page: redirect to login with `?next=` (same-site paths only);
- fail closed: a verifier that throws, anything but a literal `true`, or missing configuration never allows access (API 503, page to login with `error=unconfigured`);
- login and its API sit outside the protected paths, or are listed as explicit exceptions.

Boundary: `proxy.ts` only. Neither store's admin layout has a guard. The mechanism is injected.

Mechanism: Moon's signed, expiring, role-bearing cookie with `timingSafeEqual` and secret rotation is the preferred reference (the starter ships a small version). Travaholic's cookie is the unsalted `SHA-256(ADMIN_PASSWORD)` compared with `===`. It fails closed, but the cookie is a permanent credential and a crackable hash of the password. **Migrate later**, in a quiet hour, with a live check. It was not changed in this work.

## How module status works

The registry `MODULES` (36 modules: 12 core, 17 optional, 7 client-specific) now lives in the package. It was moved from the control-plane incubator; there is no second list. Each module can declare:

- `requires`: other modules that must be live;
- `setup.settings`: setting keys that must be present (keys only, never values);
- `setup.integrations`: integration slots the brand must declare;
- `ownerBrand`: for client extensions, the one brand that may use it.

Only requirements evidenced in the code of both reference stores are recorded (for example `ANTHROPIC_API_KEY` for ad briefs, the business plan and growth recommendations, `OPENAI_API_KEY` for image generation, the Meta pair for ad performance). Ux Insights (Clarity) is evidenced in Travaholic only and says so. Permissions are not modelled: no module needs one beyond admin access.

`resolveModuleStatus(config, probe)` returns `live`, `setup_required`, `blocked` or `available` for every module the brand may see. Blocked takes precedence over setup required. Client extensions owned by another brand are omitted. A brand cannot switch on another brand's extension (`validateBrandConfig` errors).

## How Supabase is isolated

Shared code is not shared brand data. Each brand has its own Supabase project, environment and records. The starter's `lib/supabase.ts` has no default project, no fallback and no cache between calls; it requires `RETAIL_OS_BRAND_KEY` to equal the app's configured brand before it will connect. A test fails if any source file hardcodes a project URL or key. There is no central operational Supabase.

## How to create a new brand

Eight steps, in `starters/next-brand-plane/README.md`: register in the estate; create the repo from the starter and pin the package by SHA; fill `brand/config.ts`; have a person commit the Foundation; create the brand's own Supabase project and run `app_settings.sql`; set the environment; switch modules on and clear every "Setup required"; test, preview, deploy, health check.

The starter lives inside the package repo for now. No new repository was created. Extracting it into a template repo is mechanical and is a decision for Virat.

## What must not be forked

The admin protection boundary and its policy, the identity contract, the module registry, the Foundation gate and voice mechanics, the Supabase boundary. If a brand needs these to behave differently, that is an exception, not an edit.

## What requires an exception

Anything that changes the core for one brand: a different admin policy, a second module list, a second identity type, a shared database, a brand value in platform code. It is classified first (client-specific extension or custom build) and approved by Virat. Client-specific code stays in that brand's repo and is declared in its config.

## Fresh For Paws

Commercial: paid active client. Technical: active paid client, no dedicated repository (`ESTATE.md` §7). Known signal: a WooCommerce front stays and Retail OS runs behind it.

The brand plane accommodates that without changing the core. Commerce is a module that declares the settings and integration it needs; the Command Centre reports it as Setup required until they exist, and the shell, identity, Foundation and admin boundary do not care where orders come from. Whether Fresh For Paws needs a full storefront, an admin-only plane, a WooCommerce adapter or a hybrid is a separate decision. No adapter is built and no repository was created.

## Compatibility matrix: Travaholic and Moon

Read from `main` of both repos. "Extracted" means the shared mechanics now exist in the package or starter; neither store consumes them yet.

| Capability | Travaholic | Moon | Canonical pattern | Extracted? |
|---|---|---|---|---|
| Identity | local `lib/retail-os-brand.ts`, `brand: RetailOsBrand` | same file shape | `RetailOsBrand` in the package | Yes. Both assignable, no adapter. Stores migrate in PR #5 / #3 (open) |
| Foundation | `lib/brand-foundation.ts` on `main` (PR #21 merged); values-from-Foundation in open PR #22 | not on `main`; open PR #19 | committed Foundation, `requireCommitted`, drift check | Gate and drift check: yes. Content: stays in brand |
| Voice | `brand-voice.ts`: `checkVoice`, `voiceGate` (fails open if checker crashes, transactional never blocked, campaign option) | same names; `voiceGate` has no crash guard, no transactional | `VoiceChecker` + `createVoiceGate` | Mechanics: yes (fail closed by default). Rules and words: no, by design |
| Admin shell | `AdminShell`, `nav.ts`, `CommandPalette` (165/74/103 lines) | same three (193/114/132 lines) | starter shell fed by `buildNavModel` | Minimal shell: yes. The two full shells have not been converged |
| Auth policy | `/admin/*`, `/api/admin/*`; API 401, page redirect; login inside matcher with two exceptions; 503 if unconfigured | same matcher; login at `/admin-login` outside it | `admin-gate` | Yes |
| Session mechanism | env password, `SHA-256` cookie, `===` | signed expiring role cookie, scrypt, team invites | injected; signed cookie preferred | Reference in starter. Travaholic: **migrate later** |
| `proxy.ts` | Next 16, fail closed | Next 16, fail closed | adapts `admin-gate`, supplies verifier | Yes (starter) |
| Supabase | `lib/supabase.ts`, service role, server only | byte-identical | no default project, brand-key guard | Yes (starter), stricter |
| Settings | `app_settings`, 92 keys in `SETTINGS_KEYS` | same table, 87 keys | key/value table; module `setup.settings` declares what matters | Reader and presence probe: yes. Key lists: stay local |
| Navigation | static `NAV_SECTIONS` (8 sections) | same 8 sections | canonical `NAV_GROUPS` (17), brand label overrides | Groups: yes. Mapping the stores' sections onto them: not done |
| Module model | a route plus a nav entry; no registry | same | `MODULES` registry plus `resolveModuleStatus` | Yes |
| Environment | 2 env vars, plus `ADMIN_PASSWORD`; rest in `app_settings` | same; no example file | `.env.example` contract: brand key, 2 Supabase vars, 2 admin vars | Yes (starter) |

## Not built or not proven

- The starter has not been provisioned into a real second brand repo. Its proof is tests, a typecheck, a production build, and a run of the built server (below).
- Neither store was built against v0.3.0.
- Login rate limiting is not in the starter. It is listed in its README as required before a real brand goes live.
- The registry's setup requirements cover 7 modules. The rest declare none, which means "no known requirement", not "none needed".
- The control-plane incubator (`retail-os/brand-config/`) still holds an older copy of the registry and the real-brand registrations (`brands/*.ts`). The package is authoritative; the incubator is marked superseded. Deleting it, and deciding where real-brand registrations live, is an open decision.

## Evidence

- Package: 49 of 49 tests pass (18 pre-existing, 31 new). `tsc` clean.
- Starter: 21 of 21 tests pass; `tsc --noEmit` clean; `next build` succeeds on Next 16.3.0.
- Built server, over HTTP: unauthenticated page 307 to login; unauthenticated API 401; wrong password rejected; right password sets an HttpOnly cookie and `/admin` returns 200; an external `next=` URL falls back to `/admin`; with admin unconfigured the API returns 503 and pages redirect to login with `error=unconfigured`; a forged cookie is refused.
- Travaholic and Moon: untouched.
