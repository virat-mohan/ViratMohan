// Synthetic reference brand configuration.
// Replace with your brand's real identity, tokens and module overrides.
// This file is the ONLY place a brand's configuration lives in its own repo.

import type { RetailOsBrand } from '@retail-os/brand-config/brand-identity';
import type { BrandConfig, BrandConfigInput } from '@retail-os/brand-config/brand-config';
import type { ModuleDef } from '@retail-os/brand-config/modules';

export const BRAND_KEY = 'starter';

export const identity: RetailOsBrand = {
  key: BRAND_KEY,
  profile: {
    brandName: 'Starter Brand',
    tagline: 'A reference Retail OS brand (synthetic)',
    voice: 'Warm, plain, direct.',
    productNoun: 'product',
    currencySymbol: '₹',
    siteUrl: 'https://starter.example',
    instagramHandle: 'starterbrand',
  },
  description: 'Synthetic brand proving the Retail OS brand-plane starter.',
  keywords: ['starter', 'synthetic', 'reference'],
  assets: {
    orgLogoPath: '/brand/logo.svg',
    navLogoPath: '/brand/logo.svg',
    navLogoAlt: 'Starter Brand',
    ogImagePath: '/brand/og.png',
  },
};

export const brandConfigInput: BrandConfigInput = {
  identity,
  design: { expression: 'paper' },
  commerce: { currency: 'INR' },
  integrations: { payment: ['upi'] },
  modules: {},
  extensions: [],
};
