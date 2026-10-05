// Retail OS — module registry + the five-way capability classification.
//
// Every major capability evidenced across the live brands (Stage 8 inventory)
// is recorded here with its canonical classification. This is the single place
// that answers "is X core / optional / brand config / client-specific?" and
// which module a nav group depends on. Preserve, classify — never delete.

export type Classification =
  | 'core' //            every normal Retail OS brand gets it
  | 'optional' //        reusable module, enabled per brand
  | 'client-extension' // runs inside Retail OS, specific to one brand
  | 'unknown'; //        classification required

export type ModuleKey =
  // CORE
  | 'storefront' | 'orders' | 'catalogue' | 'inventory-master' | 'customers'
  | 'coupons' | 'reviews' | 'returns' | 'finance-pnl' | 'analytics'
  | 'settings' | 'transactional-comms'
  // OPTIONAL REUSABLE MODULES
  | 'loyalty' | 'referrals' | 'preorders' | 'journal' | 'community-ugc'
  | 'creator-gifting' | 'pay-with-a-post' | 'ai-ad-briefs' | 'performance-manager'
  | 'growth-recommendations' | 'business-plan' | 'ai-media-gen' | 'whatsapp-inbox'
  | 'whatsapp-payment-confirm' | 'ux-insights' | 'abandoned-cart' | 'leads-crm'
  // CLIENT-SPECIFIC EXTENSIONS (Ceremony Kitchen, evidenced)
  | 'ceremony-finance' | 'ceremony-ops' | 'inventory-master-food'
  | 'sops-training' | 'b2b-proposals' | 'kitchen-production' | 'fragrance-line';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  classification: Classification;
  /** Default on for a normal brand? Core is always on; client-extensions default off. */
  defaultEnabled: boolean;
  /** Canonical navigation group this module surfaces under (see navigation.ts). */
  navGroup?: string;
  /** Other modules this one needs; enabling it with a missing dep is a validation warning. */
  requires?: ModuleKey[];
  /** Free-text note (e.g. why it is client-specific, or the reusable primitive underneath). */
  note?: string;
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  // ---- CORE ----
  storefront: { key: 'storefront', label: 'Storefront & Checkout', classification: 'core', defaultEnabled: true, navGroup: 'commerce' },
  orders: { key: 'orders', label: 'Orders', classification: 'core', defaultEnabled: true, navGroup: 'orders' },
  catalogue: { key: 'catalogue', label: 'Catalogue / Products', classification: 'core', defaultEnabled: true, navGroup: 'products' },
  'inventory-master': { key: 'inventory-master', label: 'Inventory Master', classification: 'core', defaultEnabled: true, navGroup: 'inventory-master', note: 'Stores today ship the Stock view; the full ledger/BOM/vendors model is the Ceremony reference (inventory-master-food).' },
  customers: { key: 'customers', label: 'Customers', classification: 'core', defaultEnabled: true, navGroup: 'customers' },
  coupons: { key: 'coupons', label: 'Coupons & Discounts', classification: 'core', defaultEnabled: true, navGroup: 'marketing' },
  reviews: { key: 'reviews', label: 'Reviews', classification: 'core', defaultEnabled: true, navGroup: 'customers' },
  returns: { key: 'returns', label: 'Returns', classification: 'core', defaultEnabled: true, navGroup: 'orders' },
  'finance-pnl': { key: 'finance-pnl', label: 'Finance / Unit Economics', classification: 'core', defaultEnabled: true, navGroup: 'finance' },
  analytics: { key: 'analytics', label: 'Analytics (first-party funnel)', classification: 'core', defaultEnabled: true, navGroup: 'analytics' },
  settings: { key: 'settings', label: 'Settings / Integrations', classification: 'core', defaultEnabled: true, navGroup: 'settings' },
  'transactional-comms': { key: 'transactional-comms', label: 'Transactional email/WhatsApp', classification: 'core', defaultEnabled: true, navGroup: 'settings' },

  // ---- OPTIONAL REUSABLE MODULES ----
  loyalty: { key: 'loyalty', label: 'Loyalty', classification: 'optional', defaultEnabled: false, navGroup: 'customers' },
  referrals: { key: 'referrals', label: 'Referrals', classification: 'optional', defaultEnabled: false, navGroup: 'customers' },
  preorders: { key: 'preorders', label: 'Preorders / Drops', classification: 'optional', defaultEnabled: false, navGroup: 'commerce' },
  journal: { key: 'journal', label: 'Journal / Content', classification: 'optional', defaultEnabled: false, navGroup: 'marketing' },
  'community-ugc': { key: 'community-ugc', label: 'Community / UGC', classification: 'optional', defaultEnabled: false, navGroup: 'marketing' },
  'creator-gifting': { key: 'creator-gifting', label: 'Creator Gifting', classification: 'optional', defaultEnabled: false, navGroup: 'marketing' },
  'pay-with-a-post': { key: 'pay-with-a-post', label: 'Pay With A Post (barter)', classification: 'optional', defaultEnabled: false, navGroup: 'marketing' },
  'ai-ad-briefs': { key: 'ai-ad-briefs', label: 'AI Ad Briefs', classification: 'optional', defaultEnabled: false, navGroup: 'marketing' },
  'performance-manager': { key: 'performance-manager', label: 'Ad Performance Manager', classification: 'optional', defaultEnabled: false, navGroup: 'growth', requires: ['ai-ad-briefs'] },
  'growth-recommendations': { key: 'growth-recommendations', label: 'Growth Recommendations', classification: 'optional', defaultEnabled: false, navGroup: 'growth' },
  'business-plan': { key: 'business-plan', label: 'Business Plan (forecast P&L)', classification: 'optional', defaultEnabled: false, navGroup: 'finance' },
  'ai-media-gen': { key: 'ai-media-gen', label: 'AI Image/Video Generation', classification: 'optional', defaultEnabled: false, navGroup: 'marketing' },
  'whatsapp-inbox': { key: 'whatsapp-inbox', label: 'WhatsApp Inbox', classification: 'optional', defaultEnabled: false, navGroup: 'customers' },
  'whatsapp-payment-confirm': { key: 'whatsapp-payment-confirm', label: 'WhatsApp Payment Confirm', classification: 'optional', defaultEnabled: false, navGroup: 'orders', requires: ['whatsapp-inbox'] },
  'ux-insights': { key: 'ux-insights', label: 'UX Insights (Clarity)', classification: 'optional', defaultEnabled: false, navGroup: 'analytics' },
  'abandoned-cart': { key: 'abandoned-cart', label: 'Abandoned Cart', classification: 'optional', defaultEnabled: false, navGroup: 'marketing' },
  'leads-crm': { key: 'leads-crm', label: 'Leads / CRM', classification: 'optional', defaultEnabled: false, navGroup: 'crm' },

  // ---- CLIENT-SPECIFIC EXTENSIONS (Ceremony Kitchen) ----
  'ceremony-finance': { key: 'ceremony-finance', label: 'Ceremony Finance', classification: 'client-extension', defaultEnabled: false, navGroup: 'finance', note: 'Reusable primitive underneath: AP bills/payment-runs/imprest. Not core.' },
  'ceremony-ops': { key: 'ceremony-ops', label: 'Ceremony Ops', classification: 'client-extension', defaultEnabled: false, navGroup: 'operations', note: 'Reusable primitives underneath: approvals, action/audit log, comments, approval-alerts, RBAC.' },
  'inventory-master-food': { key: 'inventory-master-food', label: 'Inventory Master (food: BOM/vendors/PO)', classification: 'client-extension', defaultEnabled: false, navGroup: 'inventory-master', note: 'Reference Inventory Master. General primitives (stock ledger, movements, adjustments, wastage, usage, BOM, vendors, PO, reorder) are reusable candidates; food-specifics stay Ceremony.' },
  'sops-training': { key: 'sops-training', label: 'SOPs & Training', classification: 'client-extension', defaultEnabled: false, navGroup: 'operations' },
  'b2b-proposals': { key: 'b2b-proposals', label: 'B2B Proposals / Quotes', classification: 'client-extension', defaultEnabled: false, navGroup: 'commerce' },
  'kitchen-production': { key: 'kitchen-production', label: 'Kitchen Production', classification: 'client-extension', defaultEnabled: false, navGroup: 'operations' },
  'fragrance-line': { key: 'fragrance-line', label: 'ITK Fragrance line', classification: 'client-extension', defaultEnabled: false, navGroup: 'operations' },
};

export const ALL_MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

export function isModuleKey(k: string): k is ModuleKey {
  return Object.prototype.hasOwnProperty.call(MODULES, k);
}
