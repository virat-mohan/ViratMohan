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
  color: string; // this vertical's accent — a tonal variation within the
  // same warm-earth family (amber/terracotta/olive/stone), not a different
  // brand hue. Used for its industry-chip tag badge on the main landing
  // page AND as that vertical page's own --dev-gold, so the two stay in
  // sync as a color legend a visitor can actually learn.
  bg: string; // this vertical's actual page background tint (matches its
  // own --dev-bg) — used for the color band/dot in the Industries dropdown
  // menus so the color you see there is literally the color of the page
  // you're about to land on, not the accent color.
};

export const devshopVerticals: DevShopVertical[] = [
  {
    name: 'Restaurants, Bars & Hotels',
    tag: 'F&B',
    slug: 'restaurants',
    industryLabel: 'Food & Beverage',
    status: 'live',
    blurb: 'Wastage, delivery-platform recon, kitchen ops, guest experience, menu strategy, labor, compliance — across QSR, casual dining, bars, cloud kitchens, and hotel F&B.',
    color: '#8a6a1e',
    bg: '#f7ece9',
  },
  {
    name: 'D2C E-Commerce',
    tag: 'D2C',
    slug: 'ecommerce',
    industryLabel: 'D2C E-Commerce',
    status: 'live',
    blurb: 'Cart abandonment, courier RTO, returns & reverse logistics, rising CAC, marketplace payout recon, and catalog data quality — across fashion, beauty, home, electronics, and subscription-box D2C brands.',
    color: '#a3573f',
    bg: '#f9ecf1',
  },
  {
    name: 'Retail',
    tag: 'Retail',
    slug: 'retail',
    industryLabel: 'Retail',
    status: 'live',
    blurb: 'Shrinkage, stockouts, omnichannel inventory sync, staff scheduling, and marketplace payout recon — across fashion, grocery, electronics, and multi-store chains.',
    color: '#6b7a4a',
    bg: '#eaf1f3',
  },
  {
    name: 'Real Estate & Property Management',
    tag: 'RE',
    slug: 'real-estate',
    industryLabel: 'Real Estate & Property Management',
    status: 'live',
    blurb: 'Rent recon, maintenance ticketing, vacancy forecasting, and tenant turnover — across residential, commercial, and mixed-use portfolios.',
    color: '#7a6a52',
    bg: '#eeece7',
  },
];
