# ARCHIVED: Retail OS brand-config incubator (superseded)

**Do not import, edit or extend anything in this folder.** It is kept only so the history and the reasoning stay auditable. It was moved here from `retail-os/brand-config/` on the Brand Plane branch; `git log --follow` on any file shows its full history.

Nothing consumed it: no repo imported it (checked across `ViratMohan`, `travaholic_caps`, `moon-glasses`, `ceremony-os`), CI never ran its tests (`vitest run tests/unit` only), and it is not in any build path. Its `package.json` (the name `@retail-os/brand-config` v0.1.0, a second package of the same name as the real one) was removed so no tool can resolve it by mistake.

## What replaced what

| Here | Now |
|---|---|
| `brand-identity.ts` | `brand-identity.ts` in the package repo (`virat-mohan/retail-os-brand-config`): `RetailOsBrand`, the one identity contract |
| `types.ts` `BrandIdentity` | **retired** (no consumers). Unique ideas moved: `legalName`, `assets.faviconPath` on `RetailOsBrand`; tokens became `BrandConfig.design` |
| `types.ts` (commerce, integrations, experience, `BrandConfig`), `defaults.ts`, `config.ts` | `brand-config.ts` in the package |
| `modules.ts` | `modules.ts` in the package: 29 **shared** modules plus setup requirements. The 7 client-specific extensions listed here are not in the shared registry; the owning brand declares its own in `BrandConfig.extensions` |
| `navigation.ts`, `render-contract.ts` | same names in the package |
| `test/` | package tests |
| `brands/*.ts` | **not carried over.** They described live brands from the outside, in the control plane. A brand's configuration lives in that brand's own repo (`brand/config.ts`); the control plane's registry (`brands` table) records that a brand exists. See `case-study/RETAIL-OS-BRAND-PLANE.md`, "Registration authority" |

## What stays useful here

- The client-extension descriptors in `modules.ts` (the Ceremony Kitchen ones) are the source to copy from when that brand moves onto the starter and declares its own extensions.
- `brands/*.ts` show which optional modules each live brand had switched on at the time. Treat as a historical, outside-in snapshot that may be out of date; write each brand's real configuration from that brand's own repo.
