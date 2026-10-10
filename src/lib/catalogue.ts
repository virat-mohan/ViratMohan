// Catalogue: standardized product management and creative flow across Retail OS.
// One product → multiple SKUs → variants (size, color, etc.).
// Paired with brand voice and visual system.
// Pure types and validators, no network or framework.

export type ProductStatus = 'draft' | 'review' | 'approved' | 'live' | 'archived';
export type VariantAttribute = 'size' | 'color' | 'material' | 'fit' | 'power' | 'other';

export interface ProductDimensions {
  /** Length in cm */
  length: number | null;
  /** Width in cm */
  width: number | null;
  /** Height in cm */
  height: number | null;
  /** Weight in grams */
  weight: number;
}

export interface ProductVariant {
  id: string;
  /** SKU: brand prefix + code */
  sku: string;
  /** Variant display name: e.g., "Black / S", "Red / 32mm" */
  name: string;
  /** Attribute values */
  attributes: Record<VariantAttribute, string>;
  /** Cost to brand: ₹ */
  costToMake: number;
  /** Price to customer: ₹ */
  price: number;
  /** Quantity in stock */
  stock: number | null;
  /** Physical dimensions and weight for shipping calc */
  dimensions: ProductDimensions;
  /** Active for sale */
  available: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCreative {
  /** Primary product image */
  imageUrl: string;
  /** Alt text for image */
  imageAlt: string;
  /** Short description (one line, <60 chars) */
  shortDescription: string;
  /** Long description (2-3 sentences) */
  description: string;
  /** Why the customer should buy it (value proposition in brand voice) */
  why: string;
  /** Care/usage instructions if applicable */
  instructions: string | null;
  /** Related products or bundles */
  relatedSkus: string[];
}

export interface Product {
  id: string;
  brand: string; // brand key in central registry
  /** Internal product name */
  name: string;
  /** Singular form of the product name for UX: e.g., "cap", "bottle", "set" */
  nounSingular: string;
  /** Plural form: e.g., "caps", "bottles", "sets" */
  nounPlural: string;

  status: ProductStatus;
  /** Category from brand config: e.g., "Caps", "Accessories", "Collections" */
  category: string;

  /** All SKUs and variants */
  variants: ProductVariant[];

  /** Creative: copy, images, positioning */
  creative: ProductCreative;

  /** Attributes this product can have */
  attributeOptions: Record<VariantAttribute, { label: string; options: string[] }>;

  /** On the store / live checkout */
  liveSince: string | null;

  owner: string; // who manages this product
  approvedBy: string | null; // who approved for live
  approvedAt: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Validate a Product object for basic shape and required fields.
 */
export function validateProduct(product: unknown): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!product || typeof product !== 'object') {
    return { valid: false, errors: ['not an object'] };
  }

  const p = product as Record<string, unknown>;
  if (typeof p.brand !== 'string' || !p.brand) errors.push('brand key required');
  if (typeof p.name !== 'string' || !p.name) errors.push('product name required');
  if (typeof p.nounSingular !== 'string' || !p.nounSingular) errors.push('nounSingular required');
  if (typeof p.nounPlural !== 'string' || !p.nounPlural) errors.push('nounPlural required');
  if (typeof p.status !== 'string' || !(['draft', 'review', 'approved', 'live', 'archived'] as string[]).includes(p.status)) {
    errors.push('status must be one of: draft, review, approved, live, archived');
  }

  // Variants
  if (!Array.isArray(p.variants) || (p.variants as unknown[]).length === 0) {
    errors.push('at least one variant required');
  } else {
    const skus = new Set<string>();
    for (const v of p.variants as unknown[]) {
      if (!v || typeof v !== 'object') {
        errors.push('variant must be an object');
        continue;
      }
      const variant = v as Record<string, unknown>;
      if (typeof variant.sku !== 'string' || !variant.sku) errors.push('variant sku required');
      else if (skus.has(variant.sku)) errors.push(`duplicate sku: ${variant.sku}`);
      else skus.add(variant.sku);

      if (typeof variant.price !== 'number' || variant.price <= 0) errors.push('variant price required and must be > 0');
      if (typeof variant.costToMake !== 'number' || variant.costToMake < 0) errors.push('variant costToMake required and must be >= 0');
    }
  }

  // Creative
  if (!p.creative || typeof p.creative !== 'object') errors.push('creative required');
  else {
    const c = p.creative as Record<string, unknown>;
    if (typeof c.imageUrl !== 'string' || !c.imageUrl) errors.push('creative.imageUrl required');
    if (typeof c.shortDescription !== 'string' || !c.shortDescription) errors.push('creative.shortDescription required');
    if (typeof c.description !== 'string' || !c.description) errors.push('creative.description required');
    if (typeof c.why !== 'string' || !c.why) errors.push('creative.why (value proposition) required');
  }

  // Live status requires approval
  if (p.status === 'live' && !p.approvedBy) errors.push('approvedBy required for live status');

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Calculate the margin for a variant: (price - cost) / price as a percentage.
 * Returns null if price is 0 or undefined.
 */
export function variantMarginPercent(variant: ProductVariant): number | null {
  if (!variant.price || variant.price === 0) return null;
  return Math.round(((variant.price - variant.costToMake) / variant.price) * 100);
}

/**
 * Can this product transition to a new status?
 * Lifecycle: DRAFT → REVIEW → APPROVED → LIVE, any → ARCHIVED
 */
export function canProductTransition(from: ProductStatus, to: ProductStatus): boolean {
  if (from === to) return false;
  if (to === 'archived') return true; // any status can be archived
  const order = ['draft', 'review', 'approved', 'live'];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(to);
  return toIdx === fromIdx + 1; // can only move to next status
}

/**
 * Gates that must be met before allowing a product to go live.
 */
export function checkLiveGates(product: Product): { ready: boolean; blocks: string[] } {
  const blocks: string[] = [];

  if (product.status !== 'approved') {
    blocks.push('must be approved before going live');
  }

  if (!product.variants || product.variants.length === 0) {
    blocks.push('at least one variant required');
  }

  // All variants must have valid pricing
  for (const v of product.variants || []) {
    if (v.price <= 0) blocks.push(`variant ${v.sku} has invalid price`);
    if (v.costToMake < 0) blocks.push(`variant ${v.sku} has invalid cost`);
  }

  // Creative must be complete
  if (!product.creative.imageUrl || !product.creative.why) {
    blocks.push('creative must have image and value proposition');
  }

  // Must have an owner
  if (!product.owner) blocks.push('owner required');

  // Must have approval
  if (!product.approvedBy || !product.approvedAt) {
    blocks.push('must be approved by owner');
  }

  return blocks.length === 0 ? { ready: true, blocks: [] } : { ready: false, blocks };
}
