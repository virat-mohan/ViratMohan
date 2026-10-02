// Which shipping model a brand should use, worked out from its products, not guessed.
// Light, high-value products (caps, sunglasses, pet treats): free shipping built into the
// price. Heavy or bulky products (car parts, appliances): the customer pays a live rate
// by pincode at checkout. In between: free above an order value, live rate below.
// Retail OS core (Commerce → Shipping). Used when onboarding every new brand; the result
// is a recommendation Virat or the brand can override.

export type ShippingModel = 'free' | 'threshold' | 'calculated';
export type ProductSpec = { name?: string; priceInr: number; weightKg: number; lengthCm?: number; widthCm?: number; heightCm?: number; share?: number };
export type Recommendation = {
  model: ShippingModel; thresholdInr: number | null;
  shipCostInr: number; chargeableKg: number; costPctOfOrder: number; reason: string;
};

/** Couriers bill the greater of actual and volumetric weight (L × W × H ÷ 5000), in 0.5 kg slabs. */
export function chargeableWeight(p: ProductSpec): number {
  const vol = p.lengthCm && p.widthCm && p.heightCm ? (p.lengthCm * p.widthCm * p.heightCm) / 5000 : 0;
  return Math.ceil(Math.max(p.weightKg, vol, 0.1) * 2) / 2;
}

/**
 * Planning estimate of a national surface shipment, ₹ ex-GST: first 0.5 kg plus each extra
 * 0.5 kg, plus a prepaid handling buffer. Defaults are deliberately conservative planning
 * figures; replace them with the brand's real Shiprocket rate card as soon as it exists.
 */
export const DEFAULT_RATES = { firstSlabInr: 80, extraSlabInr: 45, handlingInr: 15 };
export function estimateShipCost(chargeableKg: number, r = DEFAULT_RATES): number {
  const extra = Math.max(0, Math.ceil((chargeableKg - 0.5) / 0.5));
  return Math.round(r.firstSlabInr + extra * r.extraSlabInr + r.handlingInr);
}

/** Shipping may cost at most this share of the order before it stops being "free". */
export const FREE_MAX_PCT = 8;

/**
 * Recommend a model from the typical order (weighted by each product's share of orders,
 * or equally) and the brand's usual items per order.
 */
export function recommendShipping(products: ProductSpec[], opts: { itemsPerOrder?: number; rates?: typeof DEFAULT_RATES } = {}): Recommendation {
  if (!products.length) throw new Error('Add at least one product with price and weight');
  const items = Math.max(1, opts.itemsPerOrder ?? 1);
  const total = products.reduce((t, p) => t + (p.share ?? 1), 0);
  const avg = (f: (p: ProductSpec) => number) => products.reduce((t, p) => t + f(p) * (p.share ?? 1), 0) / total;
  const orderValue = avg((p) => p.priceInr) * items;
  const kg = Math.ceil(avg(chargeableWeight) * items * 2) / 2;
  const cost = estimateShipCost(kg, opts.rates);
  const pct = Math.round((cost / orderValue) * 1000) / 10;
  const heaviest = Math.max(...products.map(chargeableWeight));

  if (pct <= FREE_MAX_PCT && heaviest <= 2) {
    return { model: 'free', thresholdInr: null, shipCostInr: cost, chargeableKg: kg, costPctOfOrder: pct,
      reason: `Shipping is about ₹${cost} on a ₹${Math.round(orderValue)} order (${pct}%), within ${FREE_MAX_PCT}%: include it in the price and show "Free shipping".` };
  }
  // Order value at which this order's shipping falls to FREE_MAX_PCT, rounded up to a clean figure.
  const threshold = Math.ceil(((cost * 100) / FREE_MAX_PCT) / 100) * 100;
  if (heaviest <= 2 && threshold <= orderValue * 2.5) {
    return { model: 'threshold', thresholdInr: threshold, shipCostInr: cost, chargeableKg: kg, costPctOfOrder: pct,
      reason: `Shipping is about ₹${cost}, ${pct}% of a ₹${Math.round(orderValue)} order. Free from ₹${threshold.toLocaleString('en-IN')} (where it is ${FREE_MAX_PCT}% or less); below that the customer pays the live rate for their pincode.` };
  }
  return { model: 'calculated', thresholdInr: null, shipCostInr: cost, chargeableKg: kg, costPctOfOrder: pct,
    reason: `Heavy or bulky (${kg} kg chargeable, about ₹${cost} a shipment, ${pct}% of the order). The customer pays the live courier rate for their pincode at checkout, shown before payment.` };
}
