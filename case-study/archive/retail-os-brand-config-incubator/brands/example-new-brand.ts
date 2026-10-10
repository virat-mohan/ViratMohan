// SAFE NEW-BRAND PROOF (non-live, not deployed, no real customer).
// Demonstrates that a brand-new Retail OS brand is defined by CONFIGURATION ONLY
// — identity, tokens, terminology, enabled modules, integrations — with no
// application files copied or hand-edited. This is the whole point of the layer.
import { defineBrand } from '../config';

export const exampleNewBrand = defineBrand({
  identity: {
    key: 'example',
    name: 'Example Brand',
    tagline: 'A new Retail OS brand, configured not forked',
    domain: 'example.test', // placeholder only
    logoPath: '/brand/example-logo.svg',
    tokens: { expression: 'client', bg: '#faf7f0', ink: '#161310', gold: '#d4af37', secondary: '#3e6fa6' },
  },
  commerce: { currency: 'INR', currencySymbol: '₹', productNounSingular: 'item', productNounPlural: 'items' },
  integrations: { payment: ['upi'], logistics: 'shiprocket', whatsapp: 'msg91', meta: true, email: 'brevo', analytics: 'first_party' },
  // A lean launch: CORE only, plus loyalty + abandoned-cart turned on. Everything
  // else stays off until the brand needs it — no code change to enable later.
  modules: { loyalty: true, 'abandoned-cart': true },
});
