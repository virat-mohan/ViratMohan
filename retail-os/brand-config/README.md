# Retail OS — Brand Configuration Layer

The canonical, framework-agnostic layer that lets a Retail OS brand be **configured,
not copy-forked**. It is the smallest practical drift-prevention mechanism: one shared
source that every store consumes, instead of duplicated brand logic per repo.

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
