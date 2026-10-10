// Ceremony Kitchen as a Retail OS brand config.
// HARD RULE: Ceremony Kitchen IS a Retail OS client. Its structure is
//   Retail OS + Ceremony configuration + Ceremony-specific extensions.
// Ceremony Finance / Ops / food Inventory Master / SOPs / proposals / kitchen /
// fragrance are CLIENT-SPECIFIC EXTENSIONS (classification 'client-extension'),
// enabled here via hasClientExtensions — never promoted to Core Retail OS.
import { defineBrand } from '../config';

export const ceremony = defineBrand({
  identity: {
    key: 'ceremonykitchen',
    name: 'Ceremony Kitchen',
    domain: 'ceremonykitchen.com',
    tokens: { expression: 'client', bg: '#f4ead4', ink: '#1a1410', gold: '#d4af37', secondary: '#a66a62' },
  },
  commerce: { currency: 'INR', currencySymbol: '₹', productNounSingular: 'product', productNounPlural: 'products' },
  integrations: { payment: ['upi'], logistics: null, whatsapp: 'meta', meta: true, google: true, email: 'resend', analytics: 'ga4' },
  hasClientExtensions: true,
  modules: {
    'ai-ad-briefs': true, 'performance-manager': true, 'business-plan': true, 'leads-crm': true,
    // client-specific extensions (evidenced in ceremony-os):
    'ceremony-finance': true, 'ceremony-ops': true, 'inventory-master-food': true,
    'sops-training': true, 'b2b-proposals': true, 'kitchen-production': true, 'fragrance-line': true,
  },
});
