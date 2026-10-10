# Adding a New Client / Brand to DevShop Retail OS

Step-by-step checklist. Do every step in order. Source of truth for each subsystem is linked.

---

## 1. Estate & governance

1. **Add to ESTATE.md §7** — Active Client Register row: client name, commercial status, technical status, repo (or "—" if staged), notes.
2. **Add to ESTATE.md §5** — Repository estate row (once a repo exists): slug, group (05 for client brands), framework, database, deployment, status.
3. **Classify the capability** — Core Retail OS / optional module / brand config / client-specific extension / custom build. Record in ESTATE.md.

Source: `case-study/ESTATE.md`

## 2. Agent registry

1. **Create a Brand CEO agent** — add to `AGENT_REGISTRY` in `src/lib/ceo/types.ts`:
   ```ts
   { id: 'XX-01', name: '<BrandName>', role: 'brand_ceo', reports_to: 'DS-02',
     scope: { kind: 'brand', brand: '<brand_key>', founder: null, system: null, extension: null },
     capabilities: ['brand-operations'] }
   ```
   - ID format: two-letter brand prefix + `-01` (e.g. `FP-01` for Fresh For Paws).
   - `brand` key must be lowercase, no spaces, no hyphens (e.g. `freshforpaws`).

2. **Add to AGENT_TITLE** in `src/pages/retail-os/admin/control-tower.astro`:
   ```ts
   'XX-01': 'Brand CEO · <Brand Name>',
   ```

3. **Add to BRAND_LABEL and BRAND_STATUS** in the same file:
   ```ts
   BRAND_LABEL: { '<brand_key>': '<Brand Display Name>' }
   BRAND_STATUS: { '<brand_key>': 'Provisioning' }  // or 'Implementation Active', 'Retail OS Live'
   ```

Source: `src/lib/ceo/types.ts`, `case-study/ORG-SOP.md`

## 3. Estate registry (code)

1. **Add to ACTIVE_CLIENTS** in `src/lib/ceo/estate-registry.ts`:
   ```ts
   { brand: '<Brand Name>', brandKey: '<brand_key>', commercial: 'Paid Active',
     technical: 'Provisioning', repo: null, brandCeoId: 'XX-01', brandCeoName: '<Name>' }
   ```

2. **Add repo entry to REPO_ESTATE** once a repo exists (see §6 below).

Source: `src/lib/ceo/estate-registry.ts`

## 4. Specialist pool

No action needed — shared specialists (Grow, Check, Deal, Books, Care, Crew) already serve all brands via `specialistForBrand(function, brandKey)`. The new brand key is automatically available.

Source: `src/lib/ceo/specialist-pool.ts`

## 5. Work Registry

No action needed — the Work Registry accepts any brand scope. Work items for the new brand are created via the CEO orchestrator using `Scopes.brand('<brand_key>')`.

Source: `src/lib/work/`, `case-study/WORK-REGISTRY.md`

## 6. Repository (when ready)

1. **Create from starter** — never copy another brand's repo:
   ```
   starters/next-brand-plane  (from retail-os-brand-config)
   ```
2. **Pin the shared package** by full commit SHA in `package.json`.
3. **Create a Supabase project** for the brand, bind to the brand key.
4. **Add to REPO_ESTATE** in `src/lib/ceo/estate-registry.ts`.
5. **Add to boundary test** — if the new repo imports Work Registry code, add its path to `AUTHORIZED_IMPORT_PATHS` in `tests/unit/work/boundary.test.ts`.

Source: `case-study/RETAIL-OS-BRAND-PLANE.md`

## 7. Control plane registration

1. **Add to `brands` table** in the control plane's Supabase (project `vszjwgxvqoqyixpfthwl`):
   - `brand_key`, `display_name`, `status` (building/live), `supabase_ref`, terms fields.
2. **Add to `retail_os_applications`** if using the application tracking.
3. **Set Vercel env vars** for the brand (e.g. `RETAIL_OS_BRAND_<KEY>_SUPABASE_URL`).

Source: Supabase project `vszjwgxvqoqyixpfthwl`, `src/lib/brand-node/`

## 8. Health checks

1. **Add to BRANDS list** in `scripts/health/check.mjs` on launch day.
2. Verify: pages return 200, admin is locked, payment config correct (COD off, card off, UPI on).

Source: `scripts/health/check.mjs`

## 9. Org chart & command centre

Once the agent is in AGENT_REGISTRY, it automatically appears in:
- The interactive org chart (Organisation tab)
- The Brands tab
- The Projects tab (once a repo exists)
- CEO routing (`brandCeoFor()`)

## 10. Channels (future)

When ready, configure:
- WhatsApp: own number via Embedded Signup (coexistence mode)
- Email: authenticated domain
- These are marked `SETUP_REQUIRED` until configured.

---

## Quick reference: what to touch for a new client

| What | Where | When |
|------|-------|------|
| ESTATE.md | `case-study/ESTATE.md` §5 + §7 | Day 1 |
| Agent registry | `src/lib/ceo/types.ts` | Day 1 |
| Estate registry code | `src/lib/ceo/estate-registry.ts` | Day 1 |
| Control tower labels | `control-tower.astro` BRAND_LABEL/STATUS/TITLE | Day 1 |
| Supabase project | Create new project | When provisioning starts |
| Repository | From starter, never copy | When build starts |
| Health checks | `scripts/health/check.mjs` | Launch day |
| Brand book module | `lib/brand-voice.ts` in brand repo | Before any customer-facing word |

---

## What NOT to do

- Do not copy another brand's repo (anti-fork rule).
- Do not add brand configuration to the control plane or the shared package.
- Do not create a separate ticket/task system — use the Work Registry.
- Do not deploy without Virat's approval.
- Do not share one Supabase project between brands.
