> **Superseded.** The canonical `@retail-os/brand-config` is the package repo (`virat-mohan/retail-os-brand-config`, v0.3.0). Its module registry, `BrandConfig`, module status, admin gate and voice mechanics replace the files in this folder, and the single identity contract is `RetailOsBrand` (the `BrandIdentity` type here had no consumers and is retired). Do not edit the registry here: change it in the package. This folder is kept only until Virat decides where real-brand registrations (`brands/*.ts`) live. See `case-study/RETAIL-OS-BRAND-PLANE.md`.

# Retail OS — Brand Configuration Layer (`@retail-os/brand-config`)

The canonical, framework-agnostic layer that lets a Retail OS brand be **configured,
not copy-forked**. It is the smallest practical drift-prevention mechanism: one shared
source that every store consumes, instead of duplicated brand logic per repo.

**Package: `@retail-os/brand-config` v0.1.0.** Two contracts live here:
- the store-plane **brand identity** contract (`brand-identity.ts` — `RetailOsBrand`,
  `defineRetailOsBrand`, `validateRetailOsBrand`, `titleBrandName`), which the live
  stores consume; and
- the higher-level admin **BrandConfig** layer (`types.ts`/`config.ts`/`modules.ts`).

## Distribution & versioning (how stores consume it)

Stores are separate repos, so the package is shared as a **Git dependency pinned to a
tag** — no monorepo, no registry infra, no runtime dependency on the ViratMohan app:

```jsonc
// a store's package.json
"dependencies": {
  "@retail-os/brand-config": "github:virat-mohan/retail-os-brand-config#v0.1.0"
}
```

- **Versioning:** semver tags (`v0.1.0`, …). A store pins an exact tag, so which brand
  runs which version is visible in its `package.json` + lockfile.
- **Upgrade:** bump the tag in the store and reinstall. **Rollback:** repin the old tag.
- **Breaking vs not:** minor/patch = additive/optional fields; major = a required-field
  or signature change. The identity contract keeps new fields **optional** to stay
  non-breaking.
- **Publication step (pending):** this folder is currently in-repo. To distribute it,
  push it as the standalone repo `virat-mohan/retail-os-brand-config` (package.json at
  root) and tag `v0.1.0`. It has **zero runtime dependencies** and no secrets, so it is
  safe to depend on from customer-facing stores.

## Consuming it in a store (migration from a local `retail-os-brand.ts`)

1. Add the git dependency above; `npm install`.
2. In the store's `lib/retail-os-brand.ts`, delete the local contract (types +
   `defineRetailOsBrand`/`validateRetailOsBrand`/`titleBrandName`) and instead
   `import { defineRetailOsBrand, validateRetailOsBrand, titleBrandName, type RetailOsBrand } from "@retail-os/brand-config/brand-identity";`
   — keep only the brand's **values** (`export const brand = defineRetailOsBrand({...})`)
   and the store's `DEFAULT_BRAND_PROFILE`.
3. Nothing else changes: `app/layout.tsx`, Navbar and footer already import `brand` from
   the store's `lib/retail-os-brand.ts`, so the swap is drop-in. Run the store's
   `node --test` brand test to confirm identical values.

The symbol names match the stores' existing local API, so consumption is a near drop-in.

**Status: foundation / proof.** This defines the architecture and proves it with the
three live brands + a safe new-brand config and passing tests. It does **not** migrate or
change any live store — wiring a live store's pages to read from here is a later,
explicitly-authorised step (see "Not done here").

## What's here

- `types.ts` — `BrandConfig` and its domains (identity, commerce, integrations,
  experience, modules). No secrets — integrations record *which* provider a brand uses,
  never keys.
- `modules.ts` — the module registry + the five-way classification
  (`core` / `optional` / `client-extension` / `unknown`) for every capability evidenced
  across the live brands (Stage 8).
- `navigation.ts` — canonical navigation groups. **Inventory Master** and
  **Catalogue / Products** are distinct groups (canonical terminology — do not merge/rename).
- `defaults.ts` — CORE Retail OS baseline + the `paper` and `devshop-dark` token sets.
- `config.ts` — `defineBrand()` (merge over CORE), `validateBrandConfig()`,
  `resolveModules()`, `isModuleEnabled()`.
- `render-contract.ts` — pure view-models (`buildHeaderModel`, `buildNavModel`,
  `capabilitiesByClass`) proving one component renders many brands from config alone.
- `brands/` — the three live brands **described** as config (`moonglasses`, `travaholic`,
  `ceremony`) + `example-new-brand` (the safe, non-live new-brand proof).

## Use

```ts
import { defineBrand, validateBrandConfig, buildNavModel } from 'retail-os/brand-config';

const brand = defineBrand({
  identity: { key: 'acme', name: 'Acme', tokens: { expression: 'client', bg: '#faf7f0', ink: '#161310', gold: '#d4af37', secondary: '#3e6fa6' } },
  commerce: { productNounSingular: 'bottle', productNounPlural: 'bottles' },
  modules: { loyalty: true },
});
validateBrandConfig(brand); // { ok, errors, warnings }
buildNavModel(brand);       // canonical nav filtered to enabled modules
```

## Rules honoured

- Core modules can't be disabled; unknown module keys are rejected; client-extensions
  warn if enabled without `hasClientExtensions`.
- Ceremony Kitchen is a Retail OS **client**; Ceremony Finance/Ops/food Inventory
  Master/SOPs/proposals are `client-extension`, never core.
- The gold accent `#d4af37` is shared system-wide; a client sets its own bg/ink/secondary.

## Not done here (deliberately)

- No live store migrated; no checkout/payments/records/inventory touched.
- No live store's pages wired to read a config from here.
- No multi-tenant decision; separate per-brand environments remain the model.

## Test

`npx vitest run retail-os/brand-config` (uses the repo's existing vitest; not part of the
root `tests/unit` suite, so it doesn't change that count).
