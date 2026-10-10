import { describe, it, expect } from 'vitest';
import {
  defineBrand, validateBrandConfig, resolveModules, isModuleEnabled,
  CORE_DEFAULTS, MODULES, ALL_MODULE_KEYS, NAV_GROUPS,
  buildHeaderModel, buildNavModel, capabilitiesByClass,
  moonglasses, travaholic, ceremony, exampleNewBrand,
} from '../index';

describe('defaults & defineBrand', () => {
  it('a minimal brand inherits CORE defaults', () => {
    const b = defineBrand({ identity: { key: 'x', name: 'X' } });
    expect(b.commerce.currency).toBe('INR');
    expect(b.integrations.analytics).toBe('first_party');
    expect(b.identity.tokens.gold).toBe('#d4af37'); // shared accent
    // every core module on by default
    for (const k of ALL_MODULE_KEYS) if (MODULES[k].classification === 'core') expect(b.modules[k]).toBe(true);
  });

  it('overrides win over defaults without dropping unspecified fields', () => {
    const b = defineBrand({ identity: { key: 'x', name: 'X' }, commerce: { productNounSingular: 'cap', productNounPlural: 'caps' } });
    expect(b.commerce.productNounSingular).toBe('cap');
    expect(b.commerce.currencySymbol).toBe('₹'); // preserved from CORE
  });
});

describe('validation', () => {
  it('accepts the safe new-brand config', () => {
    const r = validateBrandConfig(exampleNewBrand);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('requires identity key/name and valid hex tokens', () => {
    const bad = defineBrand({ identity: { key: '', name: '', tokens: { bg: 'red' } as any } });
    const r = validateBrandConfig(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('identity.key'))).toBe(true);
    expect(r.errors.some((e) => e.includes('tokens.bg'))).toBe(true);
  });

  it('rejects an unknown module key (typo protection)', () => {
    const b = defineBrand({ identity: { key: 'x', name: 'X' }, modules: { 'loyaltyy': true } });
    const r = validateBrandConfig(b);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('unknown module key'))).toBe(true);
  });

  it('refuses to disable a core module', () => {
    const b = defineBrand({ identity: { key: 'x', name: 'X' }, modules: { orders: false } });
    const r = validateBrandConfig(b);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('core module "orders" cannot be disabled'))).toBe(true);
  });

  it('warns when a module dependency is missing', () => {
    const b = defineBrand({ identity: { key: 'x', name: 'X' }, modules: { 'performance-manager': true } }); // needs ai-ad-briefs
    const r = validateBrandConfig(b);
    expect(r.ok).toBe(true); // warning, not error
    expect(r.warnings.some((w) => w.includes('requires "ai-ad-briefs"'))).toBe(true);
  });

  it('warns when a client-extension is enabled without hasClientExtensions', () => {
    const b = defineBrand({ identity: { key: 'x', name: 'X' }, modules: { 'ceremony-finance': true } });
    const r = validateBrandConfig(b);
    expect(r.warnings.some((w) => w.includes('client-extension'))).toBe(true);
  });
});

describe('module enable/disable', () => {
  it('resolves defaults + overrides', () => {
    expect(isModuleEnabled(exampleNewBrand, 'loyalty')).toBe(true);
    expect(isModuleEnabled(exampleNewBrand, 'journal')).toBe(false);
    const resolved = resolveModules(exampleNewBrand);
    expect(resolved.storefront).toBe(true);
  });
});

describe('navigation visibility (existing groups never removed for core)', () => {
  it('core groups always show; optional groups appear only with an enabled module', () => {
    const nav = buildNavModel(exampleNewBrand).map((n) => n.id);
    // core spine present
    for (const g of NAV_GROUPS.filter((x) => x.core)) expect(nav).toContain(g.id);
    // growth is non-core and example has no growth module → hidden
    expect(nav).not.toContain('growth');
    // moonglasses has performance-manager → growth visible
    expect(buildNavModel(moonglasses).map((n) => n.id)).toContain('growth');
  });

  it('Inventory Master and Catalogue/Products stay distinct canonical groups', () => {
    const ids = NAV_GROUPS.map((g) => g.id);
    expect(ids).toContain('inventory-master');
    expect(ids).toContain('products');
    expect(NAV_GROUPS.find((g) => g.id === 'inventory-master')!.label).toBe('Inventory Master');
  });

  it('applies per-brand nav label overrides', () => {
    const b = defineBrand({ identity: { key: 'x', name: 'X' }, experience: { navLabelOverrides: { marketing: 'Growth Studio' } } });
    expect(buildNavModel(b).find((n) => n.id === 'marketing')!.label).toBe('Growth Studio');
  });
});

describe('shared component render contract (one component, many brands)', () => {
  it('header model reflects each brand\'s tokens', () => {
    expect(buildHeaderModel(moonglasses).brandName).toBe('Moon-glasses');
    expect(buildHeaderModel(travaholic).colors.secondary).toBe('#e6c68f');
    expect(buildHeaderModel(exampleNewBrand).colors.bg).toBe('#faf7f0');
    // gold accent shared across the system
    expect(buildHeaderModel(ceremony).colors.gold).toBe('#d4af37');
  });
});

describe('the three live brands are all valid Retail OS brands', () => {
  it('moon, travaholic, ceremony validate', () => {
    for (const b of [moonglasses, travaholic, ceremony]) {
      const r = validateBrandConfig(b);
      expect(r.ok, `${b.identity.name}: ${r.errors.join('; ')}`).toBe(true);
    }
  });

  it('Ceremony is a Retail OS client carrying client-specific extensions (not core)', () => {
    expect(ceremony.hasClientExtensions).toBe(true);
    const caps = capabilitiesByClass(ceremony);
    expect(caps['client-extension']).toContain('ceremony-finance');
    expect(caps['client-extension']).toContain('ceremony-ops');
    expect(caps['client-extension']).toContain('inventory-master-food');
    // core is still core for Ceremony
    expect(caps['core']).toContain('orders');
    // client extensions are never classified core
    expect(MODULES['ceremony-finance'].classification).toBe('client-extension');
    expect(MODULES['inventory-master'].classification).toBe('core');
  });
});
