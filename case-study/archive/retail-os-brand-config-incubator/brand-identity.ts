// Retail OS — store-plane brand IDENTITY contract (the versioned, machine-readable
// contract the live stores consume).
//
// This is the unified superset of the local `retail-os-brand.ts` modules proven
// in Travaholic (9B) and Moon-glasses (9C). A store imports this contract and
// supplies only its own VALUES — it never recreates the contract. Brand-specific
// values, store extensions and application/commerce logic stay in the store.
//
// Distinct from the higher-level admin BrandConfig layer in this folder
// (types.ts/config.ts/modules.ts): that models a brand's product/module
// configuration; this models the customer-facing brand IDENTITY that store
// surfaces (metadata, header, footer, Organization schema, AI brand profile)
// render from. Both belong to the same canonical package. Type/function names
// here are deliberately distinct (RetailOsBrand / defineRetailOsBrand /
// validateRetailOsBrand) so both layers can be re-exported without collision,
// and so they match the stores' existing local symbol names for a drop-in swap.
//
// Pure, isomorphic, deterministic: no secrets, no network, no AI, no DB — safe
// to depend on from customer-facing store code and from tests. Canonical prose
// source of truth stays external: case-study/BRAND_OUTPUT_STANDARD.md.

/** Brand voice/commerce profile the marketing/AI pipeline reads. */
export type BrandProfile = {
  brandName: string;
  tagline: string;
  voice: string;
  productNoun: string;
  currencySymbol: string;
  siteUrl: string;
  instagramHandle: string;
  /** AI image-generation visual language. Optional — only some brands' pipelines use it (e.g. Moon). */
  visualLanguage?: string;
};

export type PostalAddress = {
  addressCountry: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  /** Single-line form for footer rendering. */
  full?: string;
};

export type BrandContact = {
  email?: string;
  whatsappLabel?: string;
  whatsappHref?: string;
};

export type BrandAssets = {
  /** Absolute-from-root path used in Organization JSON-LD. */
  orgLogoPath: string;
  navLogoPath: string;
  navLogoAlt: string;
  ogImagePath: string;
  /** Optional footer wordmark image (Travaholic uses one; Moon does not). */
  footerWordmarkPath?: string;
};

/** The customer-facing brand identity a store renders from. Required core + optional surface fields. */
export type RetailOsBrand = {
  key: string;
  profile: BrandProfile;
  /** Page-title brand form when it differs from brandName (e.g. a ™ variant). Falls back to brandName. */
  titleName?: string;
  description: string;
  keywords: string[];
  assets: BrandAssets;
  /** Optional identity block — a brand may render none of it. */
  footerBlurb?: string;
  gstin?: string;
  contact?: BrandContact;
  address?: PostalAddress;
  social?: { instagram?: string; facebook?: string };
};

/** What a brand author supplies. defineRetailOsBrand fills defaults/derived values. */
export type RetailOsBrandInput = RetailOsBrand;

/** Deterministic assembly. Kept intentionally thin — values come from the store. */
export function defineRetailOsBrand(input: RetailOsBrandInput): RetailOsBrand {
  return { ...input };
}

/** The brand name used in page titles (™/display variant when set). */
export function titleBrandName(b: RetailOsBrand): string {
  return b.titleName ?? b.profile.brandName;
}

export type RetailOsBrandValidation = { ok: boolean; errors: string[]; warnings: string[] };

/** Validate a brand identity. Errors block; warnings inform. */
export function validateRetailOsBrand(b: RetailOsBrand): RetailOsBrandValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!b.key?.trim()) errors.push("key is required");
  if (!b.profile?.brandName?.trim()) errors.push("profile.brandName is required");
  if (!b.profile?.tagline?.trim()) errors.push("profile.tagline is required");
  if (!b.profile?.siteUrl?.startsWith("http")) errors.push("profile.siteUrl must be an absolute URL");
  if (!b.profile?.currencySymbol?.trim()) errors.push("profile.currencySymbol is required");
  if (!b.description?.trim()) errors.push("description is required");
  if (!Array.isArray(b.keywords) || b.keywords.length === 0) errors.push("keywords must be a non-empty array");
  if (!b.assets?.navLogoPath?.startsWith("/")) errors.push("assets.navLogoPath must be a root-relative path");
  if (!b.assets?.orgLogoPath?.startsWith("/")) errors.push("assets.orgLogoPath must be a root-relative path");
  if (!b.assets?.ogImagePath?.startsWith("/")) errors.push("assets.ogImagePath must be a root-relative path");
  if (!b.assets?.navLogoAlt?.trim()) errors.push("assets.navLogoAlt is required");
  return { ok: errors.length === 0, errors, warnings };
}
