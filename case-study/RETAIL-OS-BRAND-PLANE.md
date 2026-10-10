# Retail OS Brand Plane

The authoritative description of how a Retail OS brand is built, registered, versioned and retired. Checked against the code on `main` of `travaholic_caps` and `moon-glasses` (5 Oct 2026), and against the package and starter built from it.

Status: package `@retail-os/brand-config` v0.3.0 and the starter `next-brand-plane` 0.2.0 are built, tested and reviewed on branch `claude/brand-plane-contract` of `virat-mohan/retail-os-brand-config` (PR open, draft, not merged, not tagged). No production brand was changed or migrated.

## What is the Brand Plane?

Retail OS has two planes.

- **Control plane**: `ViratMohan` (Astro). Knows the estate: which brands exist and on what terms. Central orchestration, standards, health checks.
- **Brand plane**: one Next.js app per brand. Storefront, admin, checkout, and the brand's own Supabase project.

A new brand goes: **registration, then identity, then a committed Foundation, then module switches, then its own data connection, then deployment.** It provides configuration. It does not edit platform internals and does not fork another brand.

## Why Next.js?

Both live stores already run Next.js 16 with the same shape (App Router, `proxy.ts`, server-side service-role Supabase, an `app_settings` table). Standardising on what is proven avoids a migration. The shared contracts stay framework-neutral so the Astro control plane can read them too.

## Where does everything live?

| Question | Answer |
|---|---|
| Where does a real brand's **registration** live? | The control plane's **central registry**: the `brands` table (`migrations/0042_brands.sql`, `src/lib/brands.ts`, edited at `/retail-os/admin/brands`), the live-connection list `RETAIL_OS_LIVE_BRANDS`, and `case-study/ESTATE.md`. |
| Where does its **brand-specific identity** live? | In the brand's own repo: `brand/config.ts` (`identity`, a `RetailOsBrand`). |
| Where does its **Brand Foundation** live? | In the brand's own repo: `brand/foundation.ts`, built from the human brand book, committed by a person. |
| Where does its **module manifest** live? | In the brand's own repo: `brand/config.ts` (`modules` switches, plus any `extensions` it owns). |
| Where does its **Supabase configuration** live? | Environment variables in the brand's own deployment (`.env.example` lists them) and the brand's own Supabase project. Never in code, never shared. |
| **Which package / starter version** is it running? | The brand repo is the source of truth: `package.json` (package pinned by commit SHA), `package-lock.json`, `brand-plane.json` (starter version). |
| How is a brand **provisioned, upgraded, retired**? | `starters/next-brand-plane/README.md` (summarised below). |

## Central registry vs brand configuration

They are not the same thing, and neither contains the other.

| | Central registry (control plane) | Brand configuration (brand repo) |
|---|---|---|
| Answers | Does this brand exist? On what terms? Who do I call? What is its status? | What does this brand look like, say and switch on? |
| Holds | key, name, status (lead, building, live, paused, ended), commercial model, contacts, lead and application links, live-since, website; connection details for the founder console (Vercel env) | identity, design tokens, commerce, declared integrations, module switches, client extensions, Foundation, voice checker, environment |
| Never holds | identity values, tokens, module switches, Foundation, voice, a brand's data | commercial terms, other brands' anything |
| Written by | Virat, via the registry page | the brand's repo, via review |
| Read by | the founder console, health checks, the estate | the brand's own app |

## Registration authority (decision)

**One authority per kind of fact, and no fourth location.**

- **Shared package** = contracts and reusable machinery. No brand values.
- **Control plane** = the central registry above. It already exists; nothing new was created.
- **Brand repository** = its own configuration and data.

What was found and decided:

- The control-plane incubator (`retail-os/brand-config/`) held `brands/*.ts`: full configuration (identity, tokens, module switches) for Travaholic, Moon and Ceremony Kitchen, written from the outside, plus an example brand. That is brand configuration kept in the control plane, a second copy of what each brand repo owns, with no consumer. It would drift.
- Those registrations do not belong in the package (the package carries no brand values) and not in the control plane (the registry says a brand exists; it does not own its configuration). They belong in each brand repo, as `brand/config.ts`.
- The incubator is genuinely superseded: its identity, config, modules, navigation and render files are ported into the package, its `BrandIdentity` type had no consumers, and nothing imported it (no import of that path in `ViratMohan`, `travaholic_caps`, `moon-glasses` or `ceremony-os`; the only mention outside this repo is a code comment in Moon; CI never ran its tests).
- It was moved with `git mv` to `case-study/archive/retail-os-brand-config-incubator/`, marked superseded with a file-by-file replacement table, and its `package.json` was removed so no tool resolves a second `@retail-os/brand-config`. History is preserved (`git log --follow`). It is out of every active path.

Result: one active registration authority (the central registry), one active home for brand configuration (the brand repo), one package of contracts.

Stale pointer to fix later: Moon's `lib/retail-os-brand.ts` (line 4) still says the canonical contract lives in this repo under `retail-os/brand-config/`. That is production code and was not touched; update the comment when Moon migrates. Travaholic has no such pointer.

## What is shared, and what is not

| Layer | Shared | Brand-specific |
|---|---|---|
| Package `@retail-os/brand-config` | identity contract, Foundation lifecycle and gate, Brand Memory, `BrandConfig`, the 29-module registry and status, admin access policy, login throttle, voice mechanics, nav groups, render models | nothing. No brand values, no secrets. A test fails if it names a real brand |
| Starter `next-brand-plane` | admin shell, `proxy.ts` boundary, login with rate limiting, Supabase boundary and brand binding, settings reader, error and loading conventions, env contract, pin check | `brand/config.ts`, `brand/foundation.ts`, `brand/voice.ts`, `.env` |
| Brand repo | the platform code it copied, unchanged | storefront, product pages, brand fonts and CSS, client extensions, data |
| Client-specific extension | the mechanism (`ModuleDef` with `ownerBrand`, validated) | the extension itself, declared in that one brand's `extensions` |

Classification of every capability follows `CLAUDE.md`: core, optional module, brand configuration, client-specific extension, custom build.

### Package versus starter

The package is installed by every brand and must stay brand-neutral and small. The starter is copied once into a brand repo and then belongs to that brand, so it can hold Next.js application code. Reviewed from the real diff (97 files):

| Class | Files | What |
|---|---|---|
| A. Reusable package code | 14 | the contract and machinery modules, `package.json`, `tsconfig.json` |
| B. Starter/template code | 35 | the Next.js app, `brand/*`, SQL, `scripts/check-pin`, `brand-plane.json` |
| C. Test or fixture | 20 | 9 package (including the synthetic `fixtures/reference-brand.ts`) and 11 starter |
| D. Documentation | 4 | READMEs and changelogs |
| E. Generated | 24 | 23 `dist/` files and the starter lockfile |
| F. Should not live in the package | 0 after cleanup | see below |

Found and removed during the review: stale `dist/brand-plane.*` left over from an earlier draft; the synthetic fixture was exported and published to every brand (now in `fixtures/`, outside `exports` and `files`); `AGENTS.md` and `CLAUDE.md` that `next dev` generated and were committed by mistake; the real Travaholic and Moon taglines in the v0.1.0 identity tests (now synthetic); seven Ceremony Kitchen modules in the shared registry (now declared by the owning brand).

`npm pack --dry-run` confirms a brand installing the package receives no starter and no fixture.

**Housing the starter inside the package repo is the right interim**, because the starter's tests and build run against the package in the same checkout, which keeps the two in step while the contract is still moving (0.x). It should become its own template repository when there is more than one brand repo copied from it, or when the package contract settles at 1.0, whichever comes first. That is an estate decision for Virat; no repository was created.

## Identity

Canonical: **`RetailOsBrand`** (`brand-identity.ts`). It is what both live stores render from, and each store's `brand` object on `main` is assignable to it at compile time with no adapter. The control-plane `BrandIdentity` type had no consumers and is retired, not aliased. `legalName` and `assets.faviconPath` moved onto `RetailOsBrand`; design tokens became `BrandConfig.design`. Changes to `RetailOsBrand` are additive (optional fields), so stores pinned to an earlier version are unaffected, including travaholic_caps#5 and moon-glasses#3.

## Brand Foundation: the only authority chain

Human brand book, then the committed Foundation, then runtime consumers. Draft, review, approved, committed, superseded; only committed passes `isDownstreamAllowed()`. Approving and committing need a named person. Runtime code (`brand-voice`, prompts, send paths) reads values from the committed Foundation and refuses to run from anything else (`requireCommitted`). Shared: the gate, the drift check, finding types, the checker interface, `createVoiceGate`. Not shared: any voice, claim, vocabulary or visual rule. A test fails if shared code, tests or docs name a real brand.

The shared voice gate fails closed if the checker crashes (`onCheckerError: "block"`). Travaholic's fails open and Moon's has no guard.

## How admin authentication works

Policy, identical for every brand, implemented once in `admin-gate`:

- `/admin/*` and `/api/admin/*` protected, matched by path segment (`/admin-login` and `/administrator` are not admin);
- unauthenticated API: 401; unauthenticated page: redirect to login with `?next=` (same-site paths only);
- fail closed: a verifier that throws, anything but a literal `true`, or missing configuration never allows access (API 503, page to login with `error=unconfigured`);
- login and its API sit outside the protected paths.

Boundary: `proxy.ts` only. Neither store's admin layout has a guard. The session mechanism is injected: Moon's signed, expiring, role-bearing cookie is the reference (the starter ships a small version). Travaholic's unsalted `SHA-256(ADMIN_PASSWORD)` cookie compared with `===` fails closed but is a permanent credential and a crackable hash. **Migrate later**, in a quiet hour, with a live check. Not changed.

**Login rate limiting** (`login-throttle`, wired in the starter):

- 5 failures from one client in 15 minutes lock that client for 15 minutes; 30 failures across all clients lock everyone for 15 minutes;
- while locked the password is not checked at all, so the endpoint cannot be used to test passwords, even with the right one;
- a successful sign-in clears that client's counter, not the global one; malformed requests and oversize passwords count as failures;
- fail closed: if the throttle store cannot be reached, sign-in is refused. In production the store is the brand's own database (`admin_login_attempts`, counted atomically under a row lock); without it sign-in is refused. A per-process memory store is used only in development and tests;
- the unconfigured gate never signs anyone in and counts nothing.

## How module status works

The registry `MODULES` (29 shared modules: 12 core, 17 optional) lives in the package. Each module can declare `requires` (modules that must be live), `setup.settings` (setting keys that must be present; keys only, never values) and `setup.integrations` (integration slots the brand must declare). Only requirements evidenced in the code of both reference stores are recorded (for example `ANTHROPIC_API_KEY` for ad briefs, `OPENAI_API_KEY` for image generation, the Meta pair for ad performance); UX Insights is evidenced in one store and says so. Permissions are not modelled: no module has a consumer for one, and one would be added only with a real consumer.

`resolveModuleStatus(config, probe)` returns `live`, `setup_required`, `blocked` or `available` for every module the brand can see. Blocked takes precedence over setup required.

**Client-specific extensions** are not in the shared registry. The one brand that owns an extension declares it in `BrandConfig.extensions` (a `ModuleDef` with `classification: "client-extension"` and `ownerBrand` equal to its own key). `validateBrandConfig` rejects a foreign owner, a key that shadows a shared module, duplicates, and unknown dependencies. The shared package carries the mechanism and none of a client's content.

## How Supabase data is isolated

Shared code is not shared brand data. Each brand has its own Supabase project, environment and records.

- `lib/supabase.ts` has no default project, no fallback, and keeps nothing between calls.
- The deployment must declare which brand it is (`RETAIL_OS_BRAND_KEY`); the app refuses to connect if that differs from its own brand key.
- **The database must prove it belongs to this brand.** `supabase/bind_brand.sql` writes the brand key into the database (`on conflict do nothing`, so re-running can never silently rebind it). `getBoundSupabaseClient()` and the Command Centre refuse a database that is unbound or bound to another brand, even when the URL and key are valid. This is what stops two brands being pointed at one database by a copy-paste of environment variables.
- A test fails if any source file hardcodes a project URL or key. `.env.example` ships no values.
- There is no central operational Supabase. (The control plane reads each live brand through its own connection entry for the founder console; it does not store brand data.)

## Versioning and dependency policy

```
BRAND repo
  brand-plane.json   starter version the brand was provisioned from
  package.json       "@retail-os/brand-config": "github:virat-mohan/retail-os-brand-config#<40-char commit SHA>"
  package-lock.json  committed; install with `npm ci`
```

- **Package**: semver. While 0.x, a minor bump may break. After merge to `main`, tag `vX.Y.Z`. Brands pin the **commit SHA** of a tagged release, never the tag, a branch or a range, because those can move.
- **Starter**: its own semver (`package.json` and `brand-plane.json` must agree). Each starter version declares the one package range it works with (`>=0.3.0 <0.4.0` for starter 0.2.0).
- **Enforced, not just written**: `npm run check:pin:strict` fails unless the package is pinned by a full SHA, a lockfile exists, the starter versions agree, and the installed package is inside the compatible range. A brand runs it in CI and before every deploy. `file:` links are allowed only outside `--strict`, for work inside the package repo.
- **Upgrade**: read the starter changelog; diff the platform files (`proxy.ts`, `lib`, `app`, `components`, `scripts`) against the new starter and apply; never touch `brand/*` or `.env`; set the new SHA, commit the lockfile and `brand-plane.json`; check, test, build, preview; deploy in a quiet hour; roll back by reverting that one commit.
- **Provision and retire**: see `starters/next-brand-plane/README.md`. Retiring keeps the registry row as the audit trail, stops the brand's crons and integrations, exports the owner's data from the brand's own project, then archives the repo and pauses the project after the owner confirms.
- No complex package manager was introduced: one tiny script, one JSON file, one lockfile.

The central registry does not record the version a brand runs today. Adding that would be a migration to the production control-plane database (applied by hand); it is not done and is listed as an open decision.

## Security review of the starter

Focused on the starter (not a DevShop-wide audit). Genuine findings only.

Fixed in this block:

1. **No login rate limiting.** Added, with a durable per-brand store and fail-closed behaviour (above). The throttle SQL was run against an embedded Postgres engine and behaves as specified; concurrent attempts rely on a row lock that has not been load-tested.
2. **`next` 16.3.0 carried three critical advisories** per `npm audit`: GHSA-p293-qw3h-jr36 (unauthenticated RCE on Windows-hosted servers, below 16.3.3), GHSA-2xp9-vwfh-vxw4 (unauthenticated RCE in the Image Optimization API with AVIF files, below 16.3.3) and GHSA-vcvr-r3jv-pc5j (RCE in `next/og` ImageResponse, below 16.3.6). The starter was bumped to 16.3.8; `npm audit --omit=dev` reports 0.
3. **Nothing tied a database to a brand.** Added the binding check.
4. **The modules holding the service-role key or throttle state could be imported by client code.** Added `server-only` and a test. (Non-public variables are not bundled into the browser, so this was a build-time safety gap, not a leak.)
5. **Sign-out accepted cross-site requests**, so another site could sign an admin out. It now refuses requests the browser marks cross-site.
6. **Malformed or oversize login input was not limited.** Passwords over 1,024 characters and unparsable bodies now count as failed attempts.

**Needs your decision, and soon (outside this block): Travaholic and Moon both pin `next` 16.3.0 in production.** I have not tested whether the advisories are exploitable there. What the code shows: both stores use `next/og` / `ImageResponse` (Travaholic `app/api/og/cart` and `app/api/og/catalog/[slug]`; Moon `app/api/og/cart` and `app/api/og/pay`; both `lib/creative-overlay.tsx`), which is the code path of GHSA-vcvr-r3jv-pc5j, so that one is on a path they use. The Image Optimization advisory looks unlikely to apply (Moon sets `images.unoptimized: true`; Travaholic uses a custom image loader), and the Windows-hosting one depends on where they run. The fix is an in-range patch bump to 16.3.8. Per the live-brand rules that is its own change: a branch, tests, a preview checked, then a quiet-hour deploy. I did not touch either store.

Checked and fine: admin pages and APIs and their matcher, including 19 path-normalisation probes against the built server (encoded, case-varied, semicolon, null-byte, `..`, trailing slash; none returned 200); open redirect (hostile `next` values all fall back to `/admin`, same origin); session cookie flags (HttpOnly, SameSite=lax, path `/`, Secure in production); forged, tampered, expired and wrongly-signed cookies refused; no `NEXT_PUBLIC_` variables; no secret in any response or cookie; unconfigured admin allows nothing; the admin layout has no guard and the proxy is the only boundary.

Design limits that remain, documented in the starter README: `ADMIN_PASSWORD` is a plaintext environment variable and there is one owner role; a session can only be revoked by rotating the signing secret; the client address comes from `x-real-ip` / `x-forwarded-for`, which only a platform that overwrites them (Vercel) makes trustworthy; the global lock means a distributed attacker can lock the admin out for 15 minutes (a deliberate fail-closed trade-off).

## Fresh For Paws

Commercial: paid active client. Technical: active paid client, no dedicated repository (`ESTATE.md` §7). Known signal: a WooCommerce front stays and Retail OS runs behind it.

**READY FOR FUTURE PROVISIONING — IMPLEMENTATION NOT STARTED.**

The provisioning architecture supports it without a new lineage: the brand plane works as an admin plane with no storefront; commerce is a module that declares the settings and integration it needs and shows Setup required until they exist; the shell, identity, Foundation and admin boundary do not care where orders come from; data is isolated in its own Supabase project and bound to its brand key; and an optional Next.js storefront can be added later as modules on the same scaffold. Whether it needs a storefront, an admin-only plane, a WooCommerce adapter or a hybrid is a separate decision. No adapter was built and no repository was created.

## Compatibility matrix: Travaholic and Moon

Read from `main` of both repos. "Extracted" means the mechanics now exist in the package or starter; neither store consumes them yet.

| Capability | Travaholic | Moon | Canonical pattern | Extracted? |
|---|---|---|---|---|
| Identity | local `lib/retail-os-brand.ts`, `brand: RetailOsBrand` | same file shape | `RetailOsBrand` in the package | Yes. Both assignable, no adapter. Store migrations: PR #5 / #3 (open) |
| Foundation | `lib/brand-foundation.ts` on `main` (PR #21 merged); values-from-Foundation in open PR #22 | not on `main`; open PR #19 | committed Foundation, `requireCommitted`, drift check | Gate and drift check: yes. Content: stays in the brand |
| Voice | `brand-voice.ts`: `checkVoice`, `voiceGate` (fails open if checker crashes, transactional never blocked, campaign option) | same names; `voiceGate` has no crash guard, no transactional | `VoiceChecker` + `createVoiceGate`, fail closed | Mechanics: yes. Rules and words: no, by design |
| Admin shell | `AdminShell`, `nav.ts`, `CommandPalette` | same three, different sizes | starter shell fed by `buildNavModel` | Minimal shell: yes. The two full shells are not converged |
| Auth policy | `/admin/*`, `/api/admin/*`; API 401, page redirect; login inside the matcher with two exceptions; 503 if unconfigured | same matcher; login at `/admin-login` outside it | `admin-gate` | Yes |
| Session mechanism | env password, `SHA-256` cookie, `===` | signed expiring role cookie, scrypt, team invites, secret rotation | injected; signed cookie preferred | Reference in starter. Travaholic: **migrate later** |
| Login throttle | none found | a small fixed delay on failed sign-in (code comment: it "blunts rapid password guessing without needing a rate-limit store"); no limit | `login-throttle`, brand-owned durable store | Yes (starter). Neither store has a real limit |
| `proxy.ts` | Next 16, fail closed | Next 16, fail closed | adapts `admin-gate`, supplies the verifier | Yes (starter) |
| Supabase | `lib/supabase.ts`, service role, server only | byte-identical | no default project, brand-key and database binding | Yes (starter), stricter |
| Settings | `app_settings`, 92 keys in `SETTINGS_KEYS` | same table, 87 keys | key/value table; module `setup.settings` declares what matters | Reader and presence probe: yes. Key lists stay local |
| Navigation | static `NAV_SECTIONS` (8 sections) | same 8 sections | canonical `NAV_GROUPS` (17), brand label overrides | Groups: yes. Mapping the stores' sections onto them: not done |
| Module model | a route plus a nav entry; no registry | same | `MODULES` registry, brand-declared extensions, `resolveModuleStatus` | Yes |
| Environment | 2 vars plus `ADMIN_PASSWORD`; rest in `app_settings` | same; no example file | `.env.example`: brand key, 2 Supabase vars, 2 admin vars | Yes (starter) |
| `next` version | 16.3.0 | 16.3.0 | 16.3.8 (see Security review) | Starter only. Stores: needs your decision |

## Proof that a brand is configured, not forked

A second synthetic brand was made by copying the starter and changing only `brand/config.ts` (plus the two documented provisioning lines: the package link and the Turbopack root). It passed the typecheck, all 53 starter tests and the production build, and the built server rendered its own name and colours. A first attempt exposed six starter tests that hardcoded the sample brand; they now derive from the brand config.

## Not built or not proven

- The starter has not been provisioned into a real second brand repo.
- Neither store was built against package v0.3.0, and neither has a real login rate limit.
- The throttle SQL was verified on an embedded engine, not on a Supabase project, and not under concurrent load.
- Registry setup requirements cover 7 modules. The rest declare none, which means "no known requirement", not "none needed".
- Package v0.3.0 is not merged or tagged, so no brand can pin it yet.

## Evidence (re-run on the pushed heads)

- Package: 63 of 63 tests pass; `tsc` clean; `dist` loads in plain Node; `npm pack` carries no starter or fixture.
- Starter: 53 of 53 tests pass; `tsc --noEmit` clean; `next build` succeeds on Next 16.3.8; `npm audit --omit=dev`: 0 vulnerabilities.
- Built server over HTTP: 19 path probes (none 200); sign-in with no durable store refused with no cookie; throttle on a dev server: 4 wrong passwords refused, 5th locked with `Retry-After`, correct password refused while locked, another client unaffected and signed in, authenticated `/admin` 200 and unauthenticated 307, malformed requests counted.
- Throttle SQL against an embedded Postgres: 14 of 14 checks pass.
- Travaholic and Moon: untouched.
