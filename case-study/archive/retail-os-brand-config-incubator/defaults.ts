// Retail OS — CORE defaults. A new brand inherits these and overrides only what differs.
import type { BrandConfig, BrandTokens } from './types';
import { MODULES, ALL_MODULE_KEYS } from './modules';

/** The gold accent is shared system-wide; a client may override its own bg/ink/secondary. */
export const PAPER_TOKENS: BrandTokens = {
  expression: 'paper',
  bg: '#f4ead4',
  ink: '#1a1410',
  gold: '#d4af37',
  secondary: '#d9714b',
  fonts: { display: 'Anton', serif: 'Instrument Serif', sans: 'Inter' },
};

export const DEVSHOP_DARK_TOKENS: BrandTokens = {
  expression: 'devshop-dark',
  bg: '#15130f',
  ink: '#f5f5f0',
  gold: '#d4af37',
  secondary: '#91afc0',
  fonts: { display: 'Anton', serif: 'Instrument Serif', sans: 'Inter' },
};

/** Module defaults come straight from the registry (core on, everything else off). */
export function defaultModuleState(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of ALL_MODULE_KEYS) out[k] = MODULES[k].defaultEnabled;
  return out;
}

/** The CORE Retail OS baseline every brand starts from before its own config is layered on. */
export const CORE_DEFAULTS: Omit<BrandConfig, 'identity'> = {
  commerce: {
    currency: 'INR',
    currencySymbol: '₹',
    productNounSingular: 'product',
    productNounPlural: 'products',
    priceDisplay: 'inclusive',
    checkout: { codEnabled: true },
  },
  integrations: {
    payment: ['upi'],
    logistics: null,
    whatsapp: null,
    meta: false,
    google: false,
    email: null,
    analytics: 'first_party',
  },
  experience: {},
  modules: defaultModuleState(),
  hasClientExtensions: false,
};
