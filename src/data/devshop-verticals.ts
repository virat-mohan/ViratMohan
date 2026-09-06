// Single source of truth for DevShop's industry verticals — the same
// product/architecture per vertical (see /devshop/restaurants.astro's header
// comment), just re-skinned and re-populated with an industry-specific
// "common use cases" library. Imported by the main /devshop page (the full
// "Industries" screen) and by PortalHeader.astro (the header's Industries
// dropdown, shown on every /devshop* page) so the two never drift apart.
//
// Add a row here each time a new vertical page ships. `status: 'live'` links
// out; `status: 'soon'` renders as a disabled placeholder.
export type DevShopVertical = {
  name: string;
  tag: string; // short badge, e.g. "F&B"
  slug: string; // route: /devshop/<slug>
  industryLabel: string; // used in "AI-Enabled Solutions for {industryLabel}"
  status: 'live' | 'soon';
  blurb: string;
};

export const devshopVerticals: DevShopVertical[] = [
  {
    name: 'Restaurants, Bars & Hotels',
    tag: 'F&B',
    slug: 'restaurants',
    industryLabel: 'Food & Beverage',
    status: 'live',
    blurb: 'Wastage, delivery-platform recon, kitchen ops, guest experience, menu strategy, labor, compliance — across QSR, casual dining, bars, cloud kitchens, and hotel F&B.',
  },
  {
    name: 'D2C E-Commerce',
    tag: 'D2C',
    slug: 'ecommerce',
    industryLabel: 'D2C E-Commerce',
    status: 'soon',
    blurb: 'Checkout, fulfillment, returns, ad spend, and channel economics — across fashion, beauty, and other D2C categories.',
  },
  {
    name: 'Retail',
    tag: 'Retail',
    slug: 'retail',
    industryLabel: 'Retail',
    status: 'soon',
    blurb: 'Inventory shrinkage, footfall-to-sales, staff scheduling, and marketplace payout recon — across offline and omnichannel retail formats.',
  },
  {
    name: 'Real Estate & Property Management',
    tag: 'RE',
    slug: 'real-estate',
    industryLabel: 'Real Estate & Property Management',
    status: 'soon',
    blurb: 'Rent recon, maintenance ticketing, vacancy forecasting, and tenant turnover — across residential, commercial, and mixed-use portfolios.',
  },
];
