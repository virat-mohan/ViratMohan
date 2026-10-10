import { describe, it, expect } from 'vitest';
import {
  defineRetailOsBrand, validateRetailOsBrand, titleBrandName,
  type RetailOsBrand,
} from '../brand-identity';

// A minimal valid brand (the shape a new brand supplies).
const base: RetailOsBrand = defineRetailOsBrand({
  key: 'demo',
  profile: {
    brandName: 'Demo', tagline: 'A tagline', voice: 'v', productNoun: 'item',
    currencySymbol: '₹', siteUrl: 'https://demo.test', instagramHandle: '@demo',
  },
  description: 'Demo brand description.',
  keywords: ['demo'],
  assets: { orgLogoPath: '/l.png', navLogoPath: '/l.png', navLogoAlt: 'Demo', ogImagePath: '/og.png' },
});

describe('brand identity contract', () => {
  it('accepts a minimal valid brand', () => {
    const r = validateRetailOsBrand(base);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('titleName falls back to brandName, or overrides for a ™ variant', () => {
    expect(titleBrandName(base)).toBe('Demo');
    expect(titleBrandName({ ...base, titleName: 'Demo™' })).toBe('Demo™');
  });

  it('flags missing required fields', () => {
    const bad = { ...base, key: '', description: '', keywords: [] as string[] };
    const r = validateRetailOsBrand(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('key'))).toBe(true);
    expect(r.errors.some((e) => e.includes('description'))).toBe(true);
    expect(r.errors.some((e) => e.includes('keywords'))).toBe(true);
  });

  it('rejects a non-absolute siteUrl and non-root asset paths', () => {
    const r = validateRetailOsBrand({ ...base, profile: { ...base.profile, siteUrl: 'ftp://x' }, assets: { ...base.assets, navLogoPath: 'l.png' } });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('siteUrl'))).toBe(true);
    expect(r.errors.some((e) => e.includes('navLogoPath'))).toBe(true);
  });

  it('optional fields (visualLanguage, footer/contact/address/social) are allowed but not required', () => {
    const rich = defineRetailOsBrand({
      ...base,
      titleName: 'Demo™',
      profile: { ...base.profile, visualLanguage: 'dark, gold accent' },
      footerBlurb: 'Stories.',
      gstin: 'GSTIN 000',
      contact: { email: 'hi@demo.test', whatsappLabel: '+91', whatsappHref: 'https://wa.me/91' },
      address: { addressCountry: 'IN', full: 'Somewhere' },
      social: { instagram: 'https://instagram.com/demo', facebook: 'https://facebook.com/demo' },
      assets: { ...base.assets, footerWordmarkPath: '/wm.png' },
    });
    const r = validateRetailOsBrand(rich);
    expect(r.ok).toBe(true);
    expect(rich.profile.visualLanguage).toBe('dark, gold accent');
  });

  it('represents both proven brands (caps has footer/contact; moon has titleName + visualLanguage)', () => {
    const caps = defineRetailOsBrand({
      key: 'caps',
      profile: { brandName: 'Travaholic', tagline: 'Stories You Can Wear', voice: 'v', productNoun: 'cap', currencySymbol: '₹', siteUrl: 'https://travaholic.in', instagramHandle: '@travaholiccaps' },
      description: 'd', keywords: ['x'],
      assets: { orgLogoPath: '/o.png', navLogoPath: '/n.png', navLogoAlt: 'Travaholic', ogImagePath: '/og.jpg', footerWordmarkPath: '/wm.png' },
      footerBlurb: 'b', gstin: 'GSTIN 07', contact: { email: 'x@y.z' }, address: { addressCountry: 'IN', full: 'addr' }, social: { instagram: 'https://i/x' },
    });
    const moon = defineRetailOsBrand({
      key: 'moonglasses',
      profile: { brandName: 'MOON GLASSES', tagline: 'See A Brighter You', voice: 'v', productNoun: 'sunglasses', currencySymbol: '₹', siteUrl: 'https://moon-glasses.store', instagramHandle: '@moonglassesonline', visualLanguage: 'near-black, gold' },
      titleName: 'MOON GLASSES™',
      description: 'd', keywords: ['x'],
      assets: { orgLogoPath: '/m.png', navLogoPath: '/m.png', navLogoAlt: 'MOON GLASSES', ogImagePath: '/m.png' },
      address: { addressCountry: 'IN' }, social: { instagram: 'https://i/m' },
    });
    expect(validateRetailOsBrand(caps).ok).toBe(true);
    expect(validateRetailOsBrand(moon).ok).toBe(true);
    expect(titleBrandName(moon)).toBe('MOON GLASSES™');
    expect(titleBrandName(caps)).toBe('Travaholic');
  });
});
