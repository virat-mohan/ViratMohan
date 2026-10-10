// Retail OS — canonical brand-configuration types (framework-agnostic).
//
// This is the SHARED layer every Retail OS store consumes so a new brand is
// CONFIGURED, not copy-forked. It carries no secrets (only which integrations a
// brand uses, never keys) and no framework code, so Next.js stores, the Astro
// control plane, and future agents can all import the same source of truth.
//
// It does NOT change any live brand. Wiring a live store's pages to read a
// config from here is a later, explicitly-authorised migration step.

/** Which approved expression of the one viratmohan.com design system a surface wears. */
export type BrandExpression = 'paper' | 'devshop-dark' | 'client';

/** Design tokens for a brand. Hex strings only; the CSS token system stays canonical (tokens.css). */
export interface BrandTokens {
  expression: BrandExpression;
  /** Page background. */ bg: string;
  /** Primary text/ink. */ ink: string;
  /** Primary accent — gold #d4af37 across the whole system unless a client overrides. */ gold: string;
  /** Secondary accent. */ secondary: string;
  fonts: { display: string; serif: string; sans: string };
}

export interface BrandIdentity {
  /** Stable slug; matches the brand registry key and RETAIL_OS_LIVE_BRANDS where one exists. */
  key: string;
  name: string;
  legalName?: string;
  tagline?: string;
  logoPath?: string;
  faviconPath?: string;
  /** Placeholder domains are fine for a non-live proof. */
  domain?: string;
  tokens: BrandTokens;
  social?: { instagram?: string; website?: string };
  contact?: { email?: string; whatsapp?: string; phone?: string };
}

export interface BrandCommerce {
  currency: string; // ISO 4217, e.g. INR
  currencySymbol: string; // e.g. ₹
  /** What a single product is called in copy (e.g. cap/sunglasses). */
  productNounSingular: string;
  productNounPlural: string;
  /** What a catalogue unit is called in this brand's narrative (e.g. "Chapter"); optional. */
  productUnitNounSingular?: string;
  productUnitNounPlural?: string;
  priceDisplay?: 'inclusive' | 'exclusive';
  checkout?: { codEnabled?: boolean };
}

/** Integrations a brand USES — presence only, never credentials. */
export interface BrandIntegrations {
  payment: Array<'razorpay' | 'paytm' | 'upi'>;
  logistics?: 'shiprocket' | null;
  whatsapp?: 'msg91' | 'meta' | null;
  meta?: boolean;
  google?: boolean;
  email?: 'brevo' | 'resend' | null;
  analytics?: 'first_party' | 'ga4' | null;
}

export interface BrandExperience {
  /** Named narrative features (e.g. blog "Journal", UGC "Explorer"); optional per brand. */
  narrative?: Record<string, string>;
  /** Per-brand label overrides for canonical navigation groups (canonical group id -> label). */
  navLabelOverrides?: Record<string, string>;
  /** Free-form terminology overrides for copy (canonical term -> brand term). */
  terminology?: Record<string, string>;
}

/** Per-brand module enable/disable overrides (module key -> enabled). Defaults come from the registry. */
export type BrandModuleOverrides = Record<string, boolean>;

export interface BrandConfig {
  identity: BrandIdentity;
  commerce: BrandCommerce;
  integrations: BrandIntegrations;
  experience: BrandExperience;
  /** Overrides on top of MODULES registry defaults. */
  modules: BrandModuleOverrides;
  /** True for a brand that carries client-specific extensions (e.g. Ceremony Kitchen). */
  hasClientExtensions?: boolean;
}

/** A partial config a brand author writes; defineBrand() merges it over CORE defaults. */
export type BrandConfigInput = {
  identity: Omit<Partial<BrandIdentity>, 'tokens'> & { key: string; name: string; tokens?: Partial<BrandTokens> & { fonts?: Partial<BrandTokens['fonts']> } };
  commerce?: Partial<BrandCommerce>;
  integrations?: Partial<BrandIntegrations>;
  experience?: Partial<BrandExperience>;
  modules?: BrandModuleOverrides;
  hasClientExtensions?: boolean;
};
