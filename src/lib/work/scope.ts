// Scope: DEVSHOP COMPANY work, RETAIL OS PLATFORM work, BRAND work, CLIENT-SPECIFIC work, FOUNDER work.
// One field on the one work object, not five ticket systems. The brand key is the central
// registry's `brands.key`; pass the known keys to have unknown brands refused.

import type { Result, Scope } from './types';
import { SCOPE_KINDS } from './types';
import { fail, ok } from './types';

const clean = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function validateScope(s: Scope, knownBrands?: ReadonlySet<string>): Result<Scope> {
  if (!s || !SCOPE_KINDS.includes(s.kind)) return fail('scope_invalid', `unknown scope kind "${s?.kind}"`);
  const brand = clean(s.brand), founder = clean(s.founder), system = clean(s.system), extension = clean(s.extension);
  if ((s.kind === 'brand' || s.kind === 'client_extension') && !brand) return fail('scope_invalid', `${s.kind} work needs a brand key`);
  if (s.kind === 'client_extension' && !extension) return fail('scope_invalid', 'client-specific work needs the extension it is about');
  if (s.kind !== 'client_extension' && extension) return fail('scope_invalid', 'only client-specific work names an extension');
  if (s.kind === 'founder' && !founder) return fail('scope_invalid', 'founder work needs a founder reference');
  if (s.kind !== 'founder' && founder) return fail('scope_invalid', 'only founder work names a founder');
  if (brand && knownBrands && !knownBrands.has(brand)) return fail('unknown_brand', `"${brand}" is not in the central registry`);
  return ok({ kind: s.kind, brand, founder, system, extension });
}

export const Scopes = {
  devshop: (system: string | null = null): Scope => ({ kind: 'devshop', brand: null, founder: null, system, extension: null }),
  retailOs: (system: string | null = null, originBrand: string | null = null): Scope => ({ kind: 'retail_os', brand: originBrand, founder: null, system, extension: null }),
  brand: (brand: string, system: string | null = null): Scope => ({ kind: 'brand', brand, founder: null, system, extension: null }),
  clientExtension: (brand: string, extension: string): Scope => ({ kind: 'client_extension', brand, founder: null, system: null, extension }),
  founder: (founder: string, brand: string | null = null): Scope => ({ kind: 'founder', brand, founder, system: null, extension: null }),
};

/** Platform-level scopes: an issue reported by several brands can be one item here. */
export const isPlatformScope = (s: Scope): boolean => s.kind === 'devshop' || s.kind === 'retail_os';
